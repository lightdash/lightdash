import {
    SchedulerJobStatus,
    type ApiCreateProjectJobResponse,
    type ApiError,
    type ApiJobStatusResponse,
    type CreateProject,
    type MostPopularAndRecentlyUpdated,
    type Project,
    type SemanticLayerConnectionUpdate,
    type UpdateProject,
    type UpdateSchedulerSettings,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { useActiveJob } from '../providers/ActiveJobProvider';
import useToaster from './toaster/useToaster';
import useQueryError from './useQueryError';

const pollSchedulerStatus = async (
    schedulerJobId: string,
    maxAttempts: number = 30,
    interval: number = 3000,
): Promise<ApiJobStatusResponse['results']> => {
    let attempts = 0;

    while (attempts < maxAttempts) {
        // eslint-disable-next-line no-await-in-loop
        const jobResult = await lightdashApi<ApiJobStatusResponse['results']>({
            method: 'GET',
            url: `/schedulers/job/${schedulerJobId}/status`,
            body: undefined,
        });

        if (jobResult.status === SchedulerJobStatus.ERROR) {
            throw new Error('Job failed');
        }

        if (
            jobResult.status === SchedulerJobStatus.STARTED ||
            jobResult.status === SchedulerJobStatus.COMPLETED
        ) {
            return jobResult;
        }

        attempts += 1;

        // eslint-disable-next-line @typescript-eslint/no-loop-func
        await new Promise((resolve) => {
            setTimeout(resolve, interval);
        });
    }

    throw new Error('Job polling exceeded maximum attempts');
};

const createProject = async (data: CreateProject) =>
    lightdashApi<ApiCreateProjectJobResponse['results']>({
        url: `/org/projects/precompiled`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateProject = async (uuid: string, data: UpdateProject) =>
    lightdashApi<ApiCreateProjectJobResponse['results']>({
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

const updateProjectSemanticLayerConnection = async (
    uuid: string,
    data: SemanticLayerConnectionUpdate,
) =>
    lightdashApi<undefined>({
        url: `/projects/${uuid}/semantic-layer-connection`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const updateProjectSchedulerSettings = async (
    uuid: string,
    data: UpdateSchedulerSettings,
) =>
    lightdashApi<undefined>({
        url: `/projects/${uuid}/schedulerSettings`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const deleteProjectSemanticLayerConnection = async (uuid: string) =>
    lightdashApi<undefined>({
        url: `/projects/${uuid}/semantic-layer-connection`,
        method: 'DELETE',
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

export const useUpdateMutation = (uuid: string) => {
    const queryClient = useQueryClient();
    const { setActiveJobId } = useActiveJob();
    const { showToastApiError } = useToaster();
    return useMutation<
        ApiCreateProjectJobResponse['results'],
        ApiError,
        UpdateProject
    >(
        async (data) => {
            const result = await updateProject(uuid, data);
            await pollSchedulerStatus(result.schedulerJobId);
            return result;
        },
        {
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
    return useMutation<
        ApiCreateProjectJobResponse['results'],
        ApiError,
        CreateProject
    >(
        async (data) => {
            const result = await createProject(data);
            await pollSchedulerStatus(result.schedulerJobId);
            return result;
        },
        {
            onSuccess: async (data) => {
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
    return useMutation<undefined, ApiError, SemanticLayerConnectionUpdate>(
        (data) => updateProjectSemanticLayerConnection(uuid, data),
        {
            mutationKey: ['project_semantic_layer_update', uuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['project', uuid]);
            },
        },
    );
};

export const useProjectSemanticLayerDeleteMutation = (uuid: string) => {
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError>(
        () => deleteProjectSemanticLayerConnection(uuid),
        {
            mutationKey: ['project_semantic_layer_delete', uuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['project', uuid]);
            },
        },
    );
};

export const useProjectUpdateSchedulerSettings = (uuid: string) => {
    const queryClient = useQueryClient();
    return useMutation<undefined, ApiError, UpdateSchedulerSettings>(
        (data) => updateProjectSchedulerSettings(uuid, data),
        {
            mutationKey: ['project_scheduler_settings_update', uuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(['project', uuid]);
                await queryClient.invalidateQueries(['schedulerLogs']);
            },
        },
    );
};
