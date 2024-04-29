import {
    type ApiError,
    type ApiJobStartedResults,
    type CreateProject,
    type MostPopularAndRecentlyUpdated,
    type Project,
    type UpdateProject,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { useActiveJob } from '../providers/ActiveJobProvider';
import useToaster from './toaster/useToaster';
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
    const { setActiveJobId } = useActiveJob();
    const { showToastApiError } = useToaster();
    return useMutation<ApiJobStartedResults, ApiError, UpdateProject>(
        (data) => updateProject(id, data),
        {
            mutationKey: ['project_update', id],
            onSuccess: async (data) => {
                setActiveJobId(data.jobUuid);

                await queryClient.invalidateQueries(['projects']);
                await queryClient.invalidateQueries(['project', id]);
                await queryClient.invalidateQueries(['tables']);
                await queryClient.invalidateQueries(['queryResults']);
                await queryClient.invalidateQueries(['status']);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to update project`,
                    apiError: error,
                });
            },
        },
    );
};

export const useCreateMutation = () => {
    const { setActiveJobId } = useActiveJob();
    const { showToastApiError } = useToaster();
    return useMutation<ApiJobStartedResults, ApiError, CreateProject>(
        (data) => createProject(data),
        {
            mutationKey: ['project_create'],
            retry: 3,
            onSuccess: (data) => {
                setActiveJobId(data.jobUuid);
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to create project`,
                    apiError: error,
                });
            },
        },
    );
};

const getMostPopularAndRecentlyUpdated = async (projectUuid: string) =>
    lightdashApi<MostPopularAndRecentlyUpdated>({
        url: `/projects/${projectUuid}/most-popular-and-recently-updated`,
        method: 'GET',
        body: undefined,
    });

export const useMostPopularAndRecentlyUpdated = (projectUuid: string) =>
    useQuery<MostPopularAndRecentlyUpdated, ApiError>({
        queryKey: ['most-popular-and-recently-updated', projectUuid],
        queryFn: () => getMostPopularAndRecentlyUpdated(projectUuid || ''),
    });
