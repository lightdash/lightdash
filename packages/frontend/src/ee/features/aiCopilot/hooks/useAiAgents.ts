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
const listAgents = () =>
    lightdashApi<ApiAiAgentSummaryResponse['results']>({
        version: 'v1',
        url: `/aiAgents`,
        method: 'GET',
        body: undefined,
    });

const getAgent = async (agentUuid: string): Promise<ApiAiAgentResponse> => {
    return Promise.resolve({
        status: 'ok',
        results: {
            uuid: agentUuid,
            organizationUuid: 'org-1',
            tags: [],
            name: 'Test Agent',
            projectUuid: 'project-1',
            integrations: [],
            tags: null,
        },
    });

    // lightdashApi<ApiAiAgentResponse>({
    //     url: `/api/v1/aiAgents/${agentUuid}`,
    //     method: 'GET',
    //     body: undefined,
    // });
};

const createAgent = async (data: ApiCreateAiAgent) =>
    lightdashApi<ApiCreateAiAgentResponse>({
        url: `/api/v1/aiAgents`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateAgent = async (data: ApiUpdateAiAgent) =>
    lightdashApi<ApiAiAgentResponse>({
        url: `/api/v1/aiAgents/${data.uuid}`,
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

// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
export const useAiAgent = (
    agentUuid: string,
    useQueryOptions?: UseQueryOptions<ApiAiAgentResponse, ApiError>,
) =>
    useQuery<ApiAiAgentResponse, ApiError>({
        queryKey: getAiAgentKey(agentUuid),
        queryFn: () => getAgent(agentUuid),
        ...useQueryOptions,
    });

// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
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

// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
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
