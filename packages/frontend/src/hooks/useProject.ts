import { ApiError, CreateProject, Project, UpdateProject } from 'common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import useQueryError from './useQueryError';

const createProject = async (data: CreateProject) =>
    lightdashApi<Project>({
        url: `/org/projects`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateProject = async (id: string, data: UpdateProject) =>
    lightdashApi<undefined>({
        url: `/projects/${id}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const getProject = async (id: string) =>
    lightdashApi<Project>({
        url: `/projects/${id}`,
        method: 'GET',
        body: undefined,
    });

export const useProject = (id: string) => {
    const [, setErrorResponse] = useQueryError();
    return useQuery<Project, ApiError>({
        queryKey: ['project', id],
        queryFn: () => getProject(id || ''),
        enabled: id !== undefined,
        retry: false,
        onError: (result) => setErrorResponse(result.error),
    });
};

export const useUpdateMutation = (id: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess } = useApp();
    return useMutation<undefined, ApiError, UpdateProject>(
        (data) => updateProject(id, data),
        {
            mutationKey: ['project_update'],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['project', id]);
                showToastSuccess({
                    title: `Project saved with success`,
                });
            },
        },
    );
};

export const useCreateMutation = () => {
    const { showToastSuccess } = useApp();
    return useMutation<Project, ApiError, UpdateProject>(
        (data) => createProject(data),
        {
            mutationKey: ['project_create'],
            onSuccess: async () => {
                showToastSuccess({
                    title: `Project created with success`,
                });
            },
        },
    );
};
