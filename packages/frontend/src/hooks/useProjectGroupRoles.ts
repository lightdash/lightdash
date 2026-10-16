import { type ApiError, type RoleAssignment } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

export const useProjectGroupRoleAssignments = (projectId: string) => {
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
            // Filter to only group assignments
            select: (data) =>
                data.filter(
                    (assignment) => assignment.assigneeType === 'group',
                ),
        },
    );
};

export const useUpsertProjectGroupRoleAssignmentMutation = (
    projectId: string,
) => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('app');
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation(
        async ({ groupId, roleId }: { groupId: string; roleId: string }) => {
            return lightdashApi({
                url: `/projects/${projectId}/roles/assignments/group/${groupId}`,
                method: 'POST',
                body: JSON.stringify({ roleId }),
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
                    'projects',
                    projectId,
                    'groupAccesses',
                ]);
                showToastSuccess({
                    title: t(
                        'useProjectGroupRoles.successGroupProjectRoleAssignmentUpdated',
                    ),
                });
            },
            onError: ({ error }: { error: any }) => {
                showToastApiError({
                    title: t(
                        'useProjectGroupRoles.failedToUpdateGroupProjectRole',
                    ),
                    apiError: error,
                });
            },
        },
    );
};

export const useDeleteProjectGroupRoleAssignmentMutation = (
    projectId: string,
) => {
    const queryClient = useQueryClient();
    const { t } = useTranslation('app');
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation(
        async (groupId: string) => {
            return lightdashApi({
                url: `/projects/${projectId}/roles/assignments/group/${groupId}`,
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
                    'projects',
                    projectId,
                    'groupAccesses',
                ]);
                showToastSuccess({
                    title: t(
                        'useProjectGroupRoles.successGroupProjectRoleAssignmentDeleted',
                    ),
                });
            },
            onError: ({ error }: { error: any }) => {
                showToastApiError({
                    title: t(
                        'useProjectGroupRoles.failedToDeleteGroupProjectRole',
                    ),
                    apiError: error,
                });
            },
        },
    );
};
