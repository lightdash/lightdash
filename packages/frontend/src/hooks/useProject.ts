import {
    type ApiError,
    type ApiJobStartedResults,
    type CreateProject,
    type MostPopularAndRecentlyUpdated,
    type Project,
    type SemanticLayerConnection,
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

const updateProject = async (uuid: string, data: UpdateProject) =>
    lightdashApi<ApiJobStartedResults>({
        url: `/projects/${uuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const getProject = async (uuid: string) =>
    lightdashApi<Project>({
        url: `/projects/${uuid}`,
        method: 'GET',
        body: undefined,
    });

const updateProjectSemanticLayer = async (
    uuid: string,
    data: SemanticLayerConnection,
) =>
    lightdashApi<undefined>({
        url: `/projects/${uuid}/semantic-layer-connection`,
        method: 'PATCH',
        body: JSON.stringify(data),
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

export const useUpdateMutation = (uuid: string) => {
    const queryClient = useQueryClient();
    const { setActiveJobId } = useActiveJob();
    const { showToastApiError } = useToaster();
    return useMutation<ApiJobStartedResults, ApiError, UpdateProject>(
        (data) => updateProject(uuid, data),
        {
            mutationKey: ['project_update', uuid],
            onSuccess: async (data) => {
                setActiveJobId(data.jobUuid);

                await queryClient.invalidateQueries(['projects']);
                await queryClient.invalidateQueries(['project', uuid]);
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

export const useProjectSemanticLayerUpdateMutation = (uuid: string) => {
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, SemanticLayerConnection>(
        (data) => updateProjectSemanticLayer(uuid, data),
        {
            mutationKey: ['project_semantic_layer_update', uuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['project', uuid]);
            },
        },
    );
};
