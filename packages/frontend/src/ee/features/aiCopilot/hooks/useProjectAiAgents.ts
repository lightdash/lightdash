import type {
    ApiAiAgentResponse,
    ApiAiAgentSummaryResponse,
    ApiCreateAiAgent,
    ApiCreateAiAgentResponse,
    ApiError,
    ApiUpdateAiAgent,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

export const PROJECT_AI_AGENTS_KEY = 'projectAiAgents';

const listProjectAgents = (projectUuid: string) =>
    lightdashApi<ApiAiAgentSummaryResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents`,
        method: 'GET',
        body: undefined,
    });

const getProjectAgent = async (
    projectUuid: string,
    agentUuid: string,
): Promise<ApiAiAgentResponse['results']> =>
    lightdashApi<ApiAiAgentResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useProjectAiAgents = (
    projectUuid?: string | null,
    options?: UseQueryOptions<ApiAiAgentSummaryResponse['results'], ApiError>,
) => {
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentSummaryResponse['results'], ApiError>({
        queryKey: [PROJECT_AI_AGENTS_KEY, projectUuid],
        queryFn: () => listProjectAgents(projectUuid!),
        ...options,
        onError: (error) => {
            showToastApiError({
                title: 'Failed to fetch project AI agents',
                apiError: error.error,
            });

            if (options?.onError) {
                options.onError(error);
            }
        },
        enabled: !!projectUuid && options?.enabled !== false,
    });
};

export const useProjectAiAgent = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
) => {
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentResponse['results'], ApiError>({
        queryKey: [PROJECT_AI_AGENTS_KEY, projectUuid, agentUuid],
        queryFn: () => getProjectAgent(projectUuid!, agentUuid!),
        onError: (error) => {
            showToastApiError({
                title: `Failed to fetch project AI agent details`,
                apiError: error.error,
            });
        },
        enabled: !!projectUuid && !!agentUuid,
    });
};

const createProjectAgent = (projectUuid: string, data: ApiCreateAiAgent) =>
    lightdashApi<ApiCreateAiAgentResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useProjectCreateAiAgentMutation = (projectUuid: string) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiCreateAiAgentResponse['results'],
        ApiError,
        ApiCreateAiAgent
    >({
        mutationFn: (data) => createProjectAgent(projectUuid, data),
        onSuccess: (result) => {
            showToastSuccess({
                title: 'AI agent created successfully',
            });
            void queryClient.invalidateQueries({
                queryKey: [PROJECT_AI_AGENTS_KEY, projectUuid],
            });
            void navigate(`/projects/${projectUuid}/ai-agents/${result.uuid}`);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to create AI agent',
                apiError: error,
            });
        },
    });
};

const updateProjectAgent = (projectUuid: string, data: ApiUpdateAiAgent) =>
    lightdashApi<ApiAiAgentResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${data.uuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useProjectUpdateAiAgentMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiAiAgentResponse['results'],
        ApiError,
        ApiUpdateAiAgent
    >({
        mutationFn: (data) => updateProjectAgent(projectUuid, data),
        onSuccess: async (data) => {
            showToastSuccess({
                title: 'AI agent updated successfully',
            });
            await queryClient.invalidateQueries({
                queryKey: [PROJECT_AI_AGENTS_KEY, projectUuid, data.uuid],
            });
            await queryClient.invalidateQueries({
                queryKey: [PROJECT_AI_AGENTS_KEY, projectUuid],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update AI agent',
                apiError: error,
            });
        },
    });
};
