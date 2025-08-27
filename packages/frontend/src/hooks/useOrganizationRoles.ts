import {
    type ApiError,
    type Role,
    type RoleAssignment,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useApp from '../providers/App/useApp';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

export const useOrganizationRoles = (loadScopes?: boolean) => {
    const { user } = useApp();
    const setErrorResponse = useQueryError();

    return useQuery<Role[], ApiError>(
        ['organization_roles', user.data?.organizationUuid, loadScopes],
        () => {
            if (!user.data?.organizationUuid) {
                throw new Error('Organization UUID is required');
            }
            const params = loadScopes ? '?load=scopes' : '';
            return lightdashApi({
                url: `/orgs/${user.data.organizationUuid}/roles${params}`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            });
        },
        {
            enabled: !!user.data?.organizationUuid,
            onError: (result: ApiError) => setErrorResponse(result),
        },
    );
};

export const useOrganizationRoleAssignments = () => {
    const { user } = useApp();
    const setErrorResponse = useQueryError();

    return useQuery<RoleAssignment[], ApiError>(
        ['organization_role_assignments', user.data?.organizationUuid],
        () => {
            if (!user.data?.organizationUuid) {
                throw new Error('Organization UUID is required');
            }
            return lightdashApi({
                url: `/orgs/${user.data.organizationUuid}/roles/assignments`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            });
        },
        {
            enabled: !!user.data?.organizationUuid,
            onError: (result: ApiError) => setErrorResponse(result),
        },
    );
};

export const useUpsertOrganizationUserRoleAssignmentMutation = () => {
    const { user } = useApp();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation(
        async ({ userId, roleId }: { userId: string; roleId: string }) => {
            if (!user.data?.organizationUuid) {
                throw new Error('Organization UUID is required');
            }
            return lightdashApi({
                url: `/orgs/${user.data.organizationUuid}/roles/assignments/user/${userId}`,
                method: 'POST',
                body: JSON.stringify({ roleId }),
                version: 'v2',
            });
        },
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    'organization_role_assignments',
                ]);
                await queryClient.invalidateQueries(['organization_users']);
                await queryClient.refetchQueries(['user']);
                showToastSuccess({
                    title: 'Success! User role updated.',
                });
            },
            onError: ({ error }: { error: any }) => {
                showToastApiError({
                    title: "Failed to update user's role",
                    apiError: error,
                });
            },
        },
    );
};
