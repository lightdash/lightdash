import { type ApiError, type RoleAssignment } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

export const useProjectRoleAssignments = (projectId: string) => {
    const setErrorResponse = useQueryError();

    return useQuery<RoleAssignment[], ApiError>(
        ['project_role_assignments', projectId],
        () => {
            return lightdashApi({
                url: `/projects/${projectId}/roles/assignments`,
                method: 'GET',
                body: undefined,
                version: 'v2',
            });
        },
        {
            enabled: !!projectId,
            onError: (result: ApiError) => setErrorResponse(result),
        },
    );
};

export const useUpsertProjectUserRoleAssignmentMutation = (
    projectId: string,
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation(
        async ({
            userId,
            roleId,
            sendEmail,
        }: {
            userId: string;
            roleId: string;
            sendEmail?: boolean;
        }) => {
            return lightdashApi({
                url: `/projects/${projectId}/roles/assignments/user/${userId}`,
                method: 'POST',
                body: JSON.stringify({ roleId, sendEmail }),
                version: 'v2',
            });
        },
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    'project_role_assignments',
                    projectId,
                ]);
                await queryClient.invalidateQueries([
                    'project_users_with_roles',
                    projectId,
                ]);
                showToastSuccess({
                    title: 'Success! User project role assignment updated.',
                });
            },
            onError: ({ error }: { error: any }) => {
                showToastApiError({
                    title: 'Failed to update user project role assignment',
                    apiError: error,
                });
            },
        },
    );
};

export const useDeleteProjectUserRoleAssignmentMutation = (
    projectId: string,
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation(
        async (userId: string) => {
            return lightdashApi({
                url: `/projects/${projectId}/roles/assignments/user/${userId}`,
                method: 'DELETE',
                body: undefined,
                version: 'v2',
            });
        },
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries([
                    'project_role_assignments',
                    projectId,
                ]);
                await queryClient.invalidateQueries([
                    'project_users_with_roles',
                    projectId,
                ]);
                showToastSuccess({
                    title: 'Success! User project role assignment deleted.',
                });
            },
            onError: ({ error }: { error: any }) => {
                showToastApiError({
                    title: 'Failed to delete user project role assignment',
                    apiError: error,
                });
            },
        },
    );
};
