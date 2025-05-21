import {
    type ApiAiAgentResponse,
    type ApiAiAgentSummaryResponse,
    type ApiAiAgentThreadResponse,
    type ApiAiAgentThreadSummaryListResponse,
    type ApiCreateAiAgent,
    type ApiCreateAiAgentResponse,
    type ApiError,
    type ApiSuccessEmpty,
    type ApiUpdateAiAgent,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationOptions,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';

// Query keys
const AI_AGENTS_KEY = ['aiAgents'];
const getAiAgentKey = (agentUuid: string) => [...AI_AGENTS_KEY, agentUuid];
const getAiAgentThreadsKey = (agentUuid: string) => [
    ...getAiAgentKey(agentUuid),
    'threads',
];
const getAiAgentThreadKey = (agentUuid: string, threadUuid: string) => [
    ...getAiAgentThreadsKey(agentUuid),
    threadUuid,
];

// API calls
const listAgents = () =>
    lightdashApi<ApiAiAgentSummaryResponse['results']>({
        version: 'v1',
        url: `/aiAgents`,
        method: 'GET',
        body: undefined,
    });

const getAgent = async (
    agentUuid: string,
): Promise<ApiAiAgentResponse['results']> =>
    lightdashApi<ApiAiAgentResponse['results']>({
        version: 'v1',
        url: `/aiAgents/${agentUuid}`,
        method: 'GET',
        body: undefined,
    });

const createAgent = async (data: ApiCreateAiAgent) =>
    lightdashApi<ApiCreateAiAgentResponse>({
        version: 'v1',
        url: `/aiAgents`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateAgent = async (data: ApiUpdateAiAgent) =>
    lightdashApi<ApiAiAgentResponse>({
        version: 'v1',
        url: `/aiAgents/${data.uuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const listAgentThreads = async (agentUuid: string) =>
    lightdashApi<ApiAiAgentThreadSummaryListResponse['results']>({
        url: `/aiAgents/${agentUuid}/threads`,
        method: 'GET',
        body: undefined,
    });

const getAgentThread = async (agentUuid: string, threadUuid: string) =>
    lightdashApi<ApiAiAgentThreadResponse['results']>({
        url: `/aiAgents/${agentUuid}/threads/${threadUuid}`,
        method: 'GET',
        body: undefined,
    });

// Hooks
export const useAiAgents = (
    useQueryOptions?: UseQueryOptions<
        ApiAiAgentSummaryResponse['results'],
        ApiError
    >,
) =>
    useQuery<ApiAiAgentSummaryResponse['results'], ApiError>({
        queryKey: AI_AGENTS_KEY,
        queryFn: listAgents,
        ...useQueryOptions,
    });

export const useAiAgent = (
    agentUuid: string,
    useQueryOptions?: UseQueryOptions<ApiAiAgentResponse['results'], ApiError>,
) =>
    useQuery<ApiAiAgentResponse['results'], ApiError>({
        queryKey: getAiAgentKey(agentUuid),
        queryFn: () => getAgent(agentUuid),
        ...useQueryOptions,
    });

export const useCreateAiAgentMutation = (
    options?: UseMutationOptions<
        ApiCreateAiAgentResponse,
        ApiError,
        ApiCreateAiAgent
    >,
) => {
    const queryClient = useQueryClient();

    return useMutation<ApiCreateAiAgentResponse, ApiError, ApiCreateAiAgent>({
        mutationFn: createAgent,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: AI_AGENTS_KEY });
        },
        ...options,
    });
};

export const useUpdateAiAgentMutation = (
    options?: UseMutationOptions<
        ApiAiAgentResponse,
        ApiError,
        ApiUpdateAiAgent
    >,
) => {
    const queryClient = useQueryClient();

    return useMutation<ApiAiAgentResponse, ApiError, ApiUpdateAiAgent>({
        mutationFn: (data) => updateAgent(data),
        onSuccess: (data) => {
            void queryClient.invalidateQueries({
                queryKey: getAiAgentKey(data.results.uuid),
            });
        },
        ...options,
    });
};

const deleteAgent = async (agentUuid: string) =>
    lightdashApi<ApiSuccessEmpty>({
        version: 'v1',
        url: `/aiAgents/${agentUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteAiAgentMutation = (
    options?: UseMutationOptions<ApiSuccessEmpty, ApiError, string>,
) => {
    const queryClient = useQueryClient();

    return useMutation<ApiSuccessEmpty, ApiError, string>({
        mutationFn: (agentUuid) => deleteAgent(agentUuid),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: AI_AGENTS_KEY });
        },
        ...options,
    });
};

export const useAiAgentThreads = (
    agentUuid: string,
    useQueryOptions?: UseQueryOptions<
        ApiAiAgentThreadSummaryListResponse['results'],
        ApiError
    >,
) =>
    useQuery<ApiAiAgentThreadSummaryListResponse['results'], ApiError>({
        queryKey: getAiAgentThreadsKey(agentUuid),
        queryFn: () => listAgentThreads(agentUuid),
        ...useQueryOptions,
    });

export const useAiAgentThread = (
    agentUuid: string,
    threadUuid: string,
    useQueryOptions?: UseQueryOptions<
        ApiAiAgentThreadResponse['results'],
        ApiError
    >,
) => {
    return useQuery<ApiAiAgentThreadResponse['results'], ApiError>({
        queryKey: getAiAgentThreadKey(agentUuid, threadUuid),
        queryFn: () => getAgentThread(agentUuid, threadUuid),
        ...useQueryOptions,
    });
};
