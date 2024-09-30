import {
    type ApiError,
    type CreateProjectMember,
    type ProjectMemberProfile,
    type UpdateProjectMember,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const getProjectAccessQuery = async (projectUuid: string) =>
    lightdashApi<ProjectMemberProfile[]>({
        url: `/projects/${projectUuid}/access`,
        method: 'GET',
        body: undefined,
    });

export const useProjectAccess = (projectUuid: string) => {
    const setErrorResponse = useQueryError();
    return useQuery<ProjectMemberProfile[], ApiError>({
        queryKey: ['project_access_users', projectUuid],
        queryFn: () => getProjectAccessQuery(projectUuid),
        onError: (result) => setErrorResponse(result),
    });
};

const removeProjectAccessQuery = async (
    projectUuid: string,
    userUuid: string,
) =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/access/${userUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useRevokeProjectAccessMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, string>(
        (data) => removeProjectAccessQuery(projectUuid, data),
        {
            mutationKey: ['project_access_revoke'],
            onSuccess: async () => {
                await queryClient.refetchQueries(['project_access_users']);
                showToastSuccess({
                    title: `Revoked project access`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to revoke project access`,
                    apiError: error,
                });
            },
        },
    );
};

const createProjectAccessQuery = async (
    projectUuid: string,
    data: CreateProjectMember,
) =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/access`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateProjectAccessMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<null, ApiError, CreateProjectMember>(
        (data) => createProjectAccessQuery(projectUuid, data),
        {
            mutationKey: ['project_access_create'],
            onSuccess: async () => {
                await queryClient.refetchQueries(['project_access_users']);
                showToastSuccess({
                    title: 'Created new project access',
                });
            },
            onError: async ({ error }) => {
                showToastApiError({
                    title: 'Failed to create project access',
                    apiError: error,
                });
            },
        },
    );
};

const updateProjectAccessQuery = async (
    projectUuid: string,
    userUuid: string,
    data: UpdateProjectMember,
) =>
    lightdashApi<null>({
        url: `/projects/${projectUuid}/access/${userUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdateProjectAccessMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        null,
        ApiError,
        UpdateProjectMember & { userUuid: string }
    >(
        ({ userUuid, ...rest }) =>
            updateProjectAccessQuery(projectUuid, userUuid, rest),
        {
            mutationKey: ['project_access_update'],
            onSuccess: async () => {
                await queryClient.refetchQueries(['project_access_users']);
                showToastSuccess({
                    title: 'Updated project access role',
                });
            },
            onError: async ({ error }) => {
                showToastApiError({
                    title: 'Failed to update project access role',
                    apiError: error,
                });
            },
        },
    );
};
