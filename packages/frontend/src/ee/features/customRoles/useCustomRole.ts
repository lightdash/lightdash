import {
    type ApiError,
    type Role,
    type RoleWithScopes,
    type UpdateRole,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../api';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import useToaster from '../../../hooks/toaster/useToaster';

const CACHE_KEY = 'custom-role';

/**
 * Hook for fetching and updating a single custom role
 * @param roleUuid - Optional role UUID for automatic fetching
 * @param options - Query options
 * @returns Query result and update mutation
 */
export const useCustomRole = (roleUuid?: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    const { data: organization } = useOrganization();

    const query = useQuery<RoleWithScopes, ApiError>({
        queryKey: [CACHE_KEY, roleUuid],
        queryFn: async () => {
            if (!roleUuid) {
                throw new Error('Role UUID is required');
            }
            const res = await lightdashApi<RoleWithScopes>({
                method: 'GET',
                url: `/orgs/${organization?.organizationUuid}/roles/${roleUuid}`,
                version: 'v2',
            });

            return res;
        },
        enabled: !!roleUuid,
    });

    const updateRole = useMutation<
        Role,
        ApiError,
        {
            roleUuid: string;
            data: UpdateRole;
        }
    >({
        mutationFn: async ({ roleUuid: uuid, data }) => {
            if (!organization?.organizationUuid) {
                throw new Error('Organization UUID not available');
            }

            return lightdashApi<Role>({
                method: 'PATCH',
                url: `/orgs/${organization.organizationUuid}/roles/${uuid}`,
                version: 'v2',
                body: JSON.stringify(data),
            });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({
                queryKey: [CACHE_KEY, roleUuid],
            });
            await queryClient.invalidateQueries({
                queryKey: ['custom-roles', organization?.organizationUuid],
            });
            showToastSuccess({
                title: `Custom role updated successfully`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to update custom role`,
                apiError: error,
            });
        },
    });

    return useMemo(
        () => ({
            ...query,
            updateRole,
        }),
        [query, updateRole],
    );
};
