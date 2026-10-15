import {
    type ApiError,
    type CreateRole,
    type Role,
    type RoleAssignee,
    type RoleWithScopes,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../api';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import useToaster from '../../../hooks/toaster/useToaster';
import i18n from '../../../i18n/i18n';

const CACHE_KEY = 'custom-roles';
const ALL_ROLES_CACHE_KEY = 'all-roles';

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
            await queryClient.invalidateQueries({
                queryKey: [ALL_ROLES_CACHE_KEY, organization?.organizationUuid],
            });
            showToastSuccess({
                title: i18n.t('toasts.created', { ns: 'customRoles' }),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.createFailed', { ns: 'customRoles' }),
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
            await queryClient.invalidateQueries({
                queryKey: [ALL_ROLES_CACHE_KEY, organization?.organizationUuid],
            });
            showToastSuccess({
                title: i18n.t('toasts.deleted', { ns: 'customRoles' }),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('toasts.deleteFailed', { ns: 'customRoles' }),
                apiError: error,
            });
        },
    });

    const getAllRoles = useQuery<RoleWithScopes[], ApiError>({
        queryKey: [ALL_ROLES_CACHE_KEY, organization?.organizationUuid],
        queryFn: async () => {
            if (!organization?.organizationUuid) {
                throw new Error('Organization UUID not available');
            }

            return lightdashApi<RoleWithScopes[]>({
                method: 'GET',
                url: `/orgs/${organization?.organizationUuid}/roles?load=scopes`,
                version: 'v2',
            });
        },
        enabled: !!organization?.organizationUuid,
    });

    return useMemo(() => {
        return {
            listRoles,
            createRole,
            deleteRole,
            getAllRoles,
        };
    }, [listRoles, createRole, deleteRole, getAllRoles]);
};

export const useRoleAssignees = (roleUuid: string | undefined) => {
    const { data: organization } = useOrganization();

    return useQuery<RoleAssignee[], ApiError>({
        queryKey: [
            CACHE_KEY,
            organization?.organizationUuid,
            roleUuid,
            'assignees',
        ],
        queryFn: async () => {
            if (!organization?.organizationUuid) {
                throw new Error('Organization UUID not available');
            }
            if (!roleUuid) {
                throw new Error('Role UUID not provided');
            }
            return lightdashApi<RoleAssignee[]>({
                method: 'GET',
                url: `/orgs/${organization.organizationUuid}/roles/${roleUuid}/assignees`,
                version: 'v2',
            });
        },
        enabled: !!organization?.organizationUuid && !!roleUuid,
    });
};
