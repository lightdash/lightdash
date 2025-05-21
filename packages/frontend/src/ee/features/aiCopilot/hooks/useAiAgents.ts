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

// const listAgentThreads = async (agentUuid: string) =>
//     lightdashApi<ApiAiAgentThreadSummaryListResponse>({
//         url: `/api/v1/aiAgents/${agentUuid}/threads`,
//         method: 'GET',
//         body: undefined,
//     });

// const getAgentThread = async (agentUuid: string, threadUuid: string) =>
//     lightdashApi<ApiAiAgentThreadResponse>({
//         url: `/api/v1/aiAgents/${agentUuid}/threads/${threadUuid}`,
//         method: 'GET',
//         body: undefined,
//     });

// Function removed - we're using mock data instead

// Removing unused getAgentThread function
// const getAgentThread = async (agentUuid: string, threadUuid: string) =>
//     lightdashApi<ApiAiAgentThreadResponse>({
//         url: `/api/v1/aiAgents/${agentUuid}/threads/${threadUuid}`,
//         method: 'GET',
//         body: undefined,
//     });

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

export const useAiAgentThreads = (
    agentUuid: string,
    useQueryOptions?: UseQueryOptions<
        ApiAiAgentThreadSummaryListResponse,
        ApiError
    >,
) =>
    useQuery<ApiAiAgentThreadSummaryListResponse, ApiError>({
        queryKey: getAiAgentThreadsKey(agentUuid),
        queryFn: () =>
            Promise.resolve({
                status: 'ok',
                results: [
                    {
                        uuid: 'thread-1',
                        agentUuid,
                        createdAt: new Date().toISOString(),
                        createdFrom: 'web',
                        firstMessage: 'How can I analyze my sales data?',
                        user: {
                            uuid: 'user-1',
                            name: 'John Doe',
                        },
                    },
                    {
                        uuid: 'thread-2',
                        agentUuid,
                        createdAt: new Date().toISOString(),
                        createdFrom: 'slack',
                        firstMessage: 'Show me revenue by region',
                        user: {
                            uuid: 'user-2',
                            name: 'Jane Smith',
                        },
                    },
                ],
            }),
        ...useQueryOptions,
    });

export const useAiAgentThread = (
    agentUuid: string,
    threadUuid: string,
    useQueryOptions?: UseQueryOptions<ApiAiAgentThreadResponse, ApiError>,
) => {
    // Define the mock data function outside the query to avoid TypeScript issues
    const getMockThreadData = (): ApiAiAgentThreadResponse => ({
        status: 'ok',
        results: {
            uuid: threadUuid,
            agentUuid,
            createdAt: new Date().toISOString(),
            // updatedAt: new Date().toISOString(),
            createdFrom: threadUuid === 'thread-1' ? 'web' : 'slack',
            firstMessage:
                threadUuid === 'thread-1'
                    ? 'How can I analyze my sales data?'
                    : 'Show me revenue by region',
            user: {
                uuid: threadUuid === 'thread-1' ? 'user-1' : 'user-2',
                name: threadUuid === 'thread-1' ? 'John Doe' : 'Jane Smith',
            },
            messages: [
                {
                    uuid: `msg-1-${threadUuid}`,
                    threadUuid,
                    message:
                        threadUuid === 'thread-1'
                            ? 'How can I analyze my sales data?'
                            : 'Show me revenue by region',
                    role: 'user',
                    createdAt: new Date(Date.now() - 3600000).toISOString(),
                    user: {
                        uuid: threadUuid === 'thread-1' ? 'user-1' : 'user-2',
                        name:
                            threadUuid === 'thread-1'
                                ? 'John Doe'
                                : 'Jane Smith',
                    },
                },
                {
                    uuid: `msg-2-${threadUuid}`,
                    threadUuid,
                    message:
                        threadUuid === 'thread-1'
                            ? "You can analyze your sales data by looking at the 'Sales Overview' dashboard. It shows revenue by product, region, and time period. You can also create custom charts in the Explore section."
                            : "Here's a breakdown of revenue by region:\n\n- North America: $1.2M\n- Europe: $950K\n- Asia: $820K\n- South America: $430K\n\nWould you like me to create a chart for this data?",
                    role: 'assistant',
                    createdAt: new Date(Date.now() - 3500000).toISOString(),
                },
                {
                    uuid: `msg-3-${threadUuid}`,
                    threadUuid,
                    message:
                        threadUuid === 'thread-1'
                            ? 'Thanks! How do I filter by date range?'
                            : 'Yes, please create a bar chart.',
                    role: 'user',
                    createdAt: new Date(Date.now() - 1800000).toISOString(),
                    user: {
                        uuid: threadUuid === 'thread-1' ? 'user-1' : 'user-2',
                        name:
                            threadUuid === 'thread-1'
                                ? 'John Doe'
                                : 'Jane Smith',
                    },
                },
                {
                    uuid: `msg-4-${threadUuid}`,
                    threadUuid,
                    message:
                        threadUuid === 'thread-1'
                            ? "To filter by date range, click on the date filter at the top of the dashboard. You can select predefined ranges like 'Last 7 days' or 'Last month', or set a custom range by selecting specific start and end dates."
                            : "I've created a bar chart showing revenue by region. You can view it here: [Revenue by Region Chart](https://example.com/chart). The chart is also available in your 'Recent Explorations' list.",
                    role: 'assistant',
                    createdAt: new Date(Date.now() - 1700000).toISOString(),
                },
            ],
        },
    });

    return useQuery<ApiAiAgentThreadResponse, ApiError>({
        queryKey: getAiAgentThreadKey(agentUuid, threadUuid),
        queryFn: () => Promise.resolve(getMockThreadData()),
        ...useQueryOptions,
    });
};
