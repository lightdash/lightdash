import {
    type ApiError,
    type CreateRole,
    type Role,
    type RoleWithScopes,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../api';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import useToaster from '../../../hooks/toaster/useToaster';

const CACHE_KEY = 'custom-roles';

export const useCustomRoles = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    const { data: organization } = useOrganization();

    const listRoles = useQuery<RoleWithScopes[], ApiError>({
        queryKey: [CACHE_KEY, organization?.organizationUuid],
        queryFn: async () => {
            if (!organization?.organizationUuid) {
                throw new Error('Organization UUID not available');
            }

            return lightdashApi<RoleWithScopes[]>({
                method: 'GET',
                url: `/orgs/${organization?.organizationUuid}/roles?roleTypeFilter=user`,
                version: 'v2',
            });
        },
        enabled: !!organization?.organizationUuid,
    });

    const createRole = useMutation<
        Role,
        ApiError,
        CreateRole & { scopes?: string[] }
    >({
        mutationKey: [CACHE_KEY],
        mutationFn: async (data) => {
            if (!organization?.organizationUuid) {
                throw new Error('Organization UUID not available');
            }

            if (!data.scopes || data.scopes.length === 0) {
                throw new Error('No scopes provided');
            }

            return lightdashApi<Role>({
                method: 'POST',
                url: `/orgs/${organization.organizationUuid}/roles`,
                version: 'v2',
                body: JSON.stringify(data),
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: [CACHE_KEY, organization?.organizationUuid],
            });
            showToastSuccess({
                title: `Custom role created successfully`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to create custom role`,
                apiError: error,
            });
        },
    });

    const deleteRole = useMutation<undefined, ApiError, string>({
        mutationFn: async (roleUuid: string) => {
            if (!organization?.organizationUuid) {
                throw new Error('Organization UUID not available');
            }
            await lightdashApi<undefined>({
                method: 'DELETE',
                url: `/orgs/${organization.organizationUuid}/roles/${roleUuid}`,
                version: 'v2',
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: [CACHE_KEY, organization?.organizationUuid],
            });
            showToastSuccess({
                title: `Custom role deleted successfully`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to delete custom role`,
                apiError: error,
            });
        },
    });

    return useMemo(() => {
        return {
            listRoles,
            createRole,
            deleteRole,
        };
    }, [listRoles, createRole, deleteRole]);
};
