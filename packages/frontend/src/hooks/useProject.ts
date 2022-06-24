import {
    ApiError,
    ApiJobStartedResults,
    CreateProject,
    Project,
    UpdateProject,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { lightdashApi } from '../api';
import { useApp } from '../providers/AppProvider';
import useQueryError from './useQueryError';

const createProject = async (data: CreateProject) =>
    lightdashApi<ApiJobStartedResults>({
        url: `/org/projects/precompiled`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateProject = async (id: string, data: UpdateProject) =>
    lightdashApi<ApiJobStartedResults>({
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

export const useProject = (id: string | undefined) => {
    const setErrorResponse = useQueryError();
    return useQuery<Project, ApiError>({
        queryKey: ['project', id],
        queryFn: () => getProject(id || ''),
        enabled: id !== undefined,
        retry: false,
        onError: (result) => setErrorResponse(result),
    });
};

export const useUpdateMutation = (id: string) => {
    const queryClient = useQueryClient();
    const { setActiveJobId, showToastError } = useApp();
    return useMutation<ApiJobStartedResults, ApiError, UpdateProject>(
        (data) => updateProject(id, data),
        {
            mutationKey: ['project_update', id],
            onSuccess: async (data) => {
                setActiveJobId(data.jobUuid);

                await queryClient.invalidateQueries(['projects']);
                await queryClient.invalidateQueries(['project', id]);
                await queryClient.invalidateQueries('tables');
                await queryClient.invalidateQueries('queryResults');
                await queryClient.invalidateQueries('status');
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to create project`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};

export const useCreateMutation = () => {
    const { setActiveJobId, showToastError } = useApp();
    return useMutation<ApiJobStartedResults, ApiError, UpdateProject>(
        (data) => createProject(data),
        {
            mutationKey: ['project_create'],
            retry: 3,
            onSuccess: (data) => {
                setActiveJobId(data.jobUuid);
            },
            onError: (error) => {
                showToastError({
                    title: `Failed to create project`,
                    subtitle: error.error.message,
                });
            },
        },
    );
};
