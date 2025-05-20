import {
    type ApiAiAgentResponse,
    type ApiAiAgentSummaryResponse,
    type ApiAiAgentThreadResponse,
    type ApiAiAgentThreadSummaryListResponse,
    type ApiCreateAiAgent,
    type ApiCreateAiAgentResponse,
    type ApiError,
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
const listAgents = async () =>
    lightdashApi<ApiAiAgentSummaryResponse>({
        url: `/api/v1/aiAgents`,
        method: 'GET',
        body: undefined,
    });

const getAgent = async (agentUuid: string) =>
    lightdashApi<ApiAiAgentResponse>({
        url: `/api/v1/aiAgents/${agentUuid}`,
        method: 'GET',
        body: undefined,
    });

const createAgent = async (data: ApiCreateAiAgent) =>
    lightdashApi<ApiCreateAiAgentResponse>({
        url: `/api/v1/aiAgents`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateAgent = async (agentUuid: string, data: ApiUpdateAiAgent) =>
    lightdashApi<ApiAiAgentResponse>({
        url: `/api/v1/aiAgents/${agentUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const listAgentThreads = async (agentUuid: string) =>
    lightdashApi<ApiAiAgentThreadSummaryListResponse>({
        url: `/api/v1/aiAgents/${agentUuid}/threads`,
        method: 'GET',
        body: undefined,
    });

const getAgentThread = async (agentUuid: string, threadUuid: string) =>
    lightdashApi<ApiAiAgentThreadResponse>({
        url: `/api/v1/aiAgents/${agentUuid}/threads/${threadUuid}`,
        method: 'GET',
        body: undefined,
    });

// Hooks
// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
const useAiAgents = (
    useQueryOptions?: UseQueryOptions<ApiAiAgentSummaryResponse, ApiError>,
) =>
    useQuery<ApiAiAgentSummaryResponse, ApiError>({
        queryKey: AI_AGENTS_KEY,
        queryFn: listAgents,
        ...useQueryOptions,
    });

// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
const useAiAgent = (
    agentUuid: string,
    useQueryOptions?: UseQueryOptions<ApiAiAgentResponse, ApiError>,
) =>
    useQuery<ApiAiAgentResponse, ApiError>({
        queryKey: getAiAgentKey(agentUuid),
        queryFn: () => getAgent(agentUuid),
        ...useQueryOptions,
    });

// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
const useCreateAiAgentMutation = (
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

// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
const useUpdateAiAgentMutation = (
    agentUuid: string,
    options?: UseMutationOptions<
        ApiAiAgentResponse,
        ApiError,
        ApiUpdateAiAgent
    >,
) => {
    const queryClient = useQueryClient();

    return useMutation<ApiAiAgentResponse, ApiError, ApiUpdateAiAgent>({
        mutationFn: (data) => updateAgent(agentUuid, data),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: getAiAgentKey(agentUuid),
            });
        },
        ...options,
    });
};

// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
const useAiAgentThreads = (
    agentUuid: string,
    useQueryOptions?: UseQueryOptions<
        ApiAiAgentThreadSummaryListResponse,
        ApiError
    >,
) =>
    useQuery<ApiAiAgentThreadSummaryListResponse, ApiError>({
        queryKey: getAiAgentThreadsKey(agentUuid),
        queryFn: () => listAgentThreads(agentUuid),
        ...useQueryOptions,
    });

// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
const useAiAgentThread = (
    agentUuid: string,
    threadUuid: string,
    useQueryOptions?: UseQueryOptions<ApiAiAgentThreadResponse, ApiError>,
) =>
    useQuery<ApiAiAgentThreadResponse, ApiError>({
        queryKey: getAiAgentThreadKey(agentUuid, threadUuid),
        queryFn: () => getAgentThread(agentUuid, threadUuid),
        ...useQueryOptions,
    });
