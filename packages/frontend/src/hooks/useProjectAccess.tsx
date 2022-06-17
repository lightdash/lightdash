import {
    ApiError,
    CreateProjectMember,
    ProjectMemberProfile,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import useQueryError from './useQueryError';

const getProjectAccessQuery = async (projectUuid: string) =>
    lightdashApi<ProjectMemberProfile[]>({
        url: `/projects/${projectUuid}/projectAccess`,
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
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/projectAccess/${userUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useRevokeProjectAccessMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useApp();
    return useMutation<undefined, ApiError, string>(
        (data) => removeProjectAccessQuery(projectUuid, data),
        {
            mutationKey: ['project_access_revoke'],
            onSuccess: async () => {
                await queryClient.refetchQueries(['project_access_users']);
                showToastSuccess({
                    title: `Revoked project access`,
                });
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to revoke project access`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

const createProjectAccessQuery = async (
    projectUuid: string,
    data: CreateProjectMember,
) =>
    lightdashApi<undefined>({
        url: `/projects/${projectUuid}/projectAccess`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateProjectAccessMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastError, showToastSuccess } = useApp();
    return useMutation<undefined, ApiError, CreateProjectMember>(
        (data) => createProjectAccessQuery(projectUuid, data),
        {
            mutationKey: ['project_access_create'],
            onSuccess: async (data) => {
                await queryClient.refetchQueries(['project_access_users']);
                showToastSuccess({
                    title: 'Created new project access',
                });
            },
            onError: async (error1) => {
                const [title, ...rest] = error1.error.message.split('\n');
                showToastError({
                    title,
                    subtitle: rest.join('\n'),
                });
            },
        },
    );
};
