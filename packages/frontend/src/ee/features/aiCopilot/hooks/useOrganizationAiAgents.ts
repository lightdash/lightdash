import type {
    AiAgent,
    AiAgentMessageAssistant,
    ApiAiAgentResponse,
    ApiAiAgentThreadCreateRequest,
    ApiAiAgentThreadCreateResponse,
    ApiAiAgentThreadMessageCreateRequest,
    ApiAiAgentThreadMessageCreateResponse,
    ApiAiAgentThreadMessageVizQuery,
    ApiAiAgentThreadResponse,
    ApiAiAgentThreadSummaryListResponse,
    ApiError,
    ApiSuccessEmpty,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { lightdashApi } from '../../../../api';
import useHealth from '../../../../hooks/health/useHealth';
import { useOrganization } from '../../../../hooks/organization/useOrganization';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useActiveProject } from '../../../../hooks/useActiveProject';
import { type UserWithAbility } from '../../../../hooks/user/useUser';
import useApp from '../../../../providers/App/useApp';
import { useAiAgentThreadStreamMutation } from '../streaming/useAiAgentThreadStreamMutation';
import { getOptimisticMessageStub } from '../utils/thinkingMessageStub';
import { PROJECT_AI_AGENTS_KEY, useProjectAiAgent } from './useProjectAiAgents';
import { USER_AGENT_PREFERENCES } from './useUserAgentPreferences';

const AI_AGENTS_KEY = 'aiAgents';
// API calls

const getAgent = async (
    agentUuid: string,
): Promise<ApiAiAgentResponse['results']> =>
    lightdashApi<ApiAiAgentResponse['results']>({
        version: 'v1',
        url: `/aiAgents/${agentUuid}`,
        method: 'GET',
        body: undefined,
    });

const listAgentThreads = async (agentUuid: string, allUsers?: boolean) => {
    const searchParams = new URLSearchParams();
    if (allUsers) {
        searchParams.set('allUsers', 'true');
    }

    const queryString = searchParams.toString();
    const url = `/aiAgents/${agentUuid}/threads${
        queryString ? `?${queryString}` : ''
    }`;

    return lightdashApi<ApiAiAgentThreadSummaryListResponse['results']>({
        url,
        method: 'GET',
        body: undefined,
    });
};

const getAgentThread = async (agentUuid: string, threadUuid: string) =>
    lightdashApi<ApiAiAgentThreadResponse['results']>({
        url: `/aiAgents/${agentUuid}/threads/${threadUuid}`,
        method: 'GET',
        body: undefined,
    });

const getAgentThreadMessageVizQuery = async (args: {
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
}) =>
    lightdashApi<ApiAiAgentThreadMessageVizQuery>({
        url: `/aiAgents/${args.agentUuid}/threads/${args.threadUuid}/message/${args.messageUuid}/viz-query`,
        method: 'GET',
        body: undefined,
    });

export const useAiAgent = (agentUuid: string | undefined) => {
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentResponse['results'], ApiError>({
        queryKey: [AI_AGENTS_KEY, agentUuid],
        queryFn: () => getAgent(agentUuid!),
        onError: (error) => {
            showToastApiError({
                title: `Failed to fetch AI agent details`,
                apiError: error.error,
            });
        },
        enabled: !!agentUuid,
    });
};

const deleteAgent = async (agentUuid: string) =>
    lightdashApi<ApiSuccessEmpty>({
        version: 'v1',
        url: `/aiAgents/${agentUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteAiAgentMutation = () => {
    const { data: activeProjectUuid } = useActiveProject();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<ApiSuccessEmpty, ApiError, string>({
        mutationFn: (agentUuid) => deleteAgent(agentUuid),
        onSuccess: async () => {
            showToastSuccess({
                title: 'AI agent deleted successfully',
            });
            await Promise.all(
                [
                    // Invalidates Project queries
                    [PROJECT_AI_AGENTS_KEY, activeProjectUuid],
                    // Invalidates Organization queries
                    [AI_AGENTS_KEY],
                    // Invalidates User Preferences queries
                    [USER_AGENT_PREFERENCES, activeProjectUuid],
                ].map((queryKey) =>
                    queryClient.invalidateQueries({
                        queryKey,
                        exact: true,
                    }),
                ),
            );
            // Not sure why this is needed, the invalidation is performed as a new request is triggered,
            // but the hook is still returning stale data
            await queryClient.refetchQueries({
                queryKey: [USER_AGENT_PREFERENCES, activeProjectUuid],
                exact: true,
            });
            void navigate(`/projects/${activeProjectUuid}/ai-agents`);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to delete AI agent',
                apiError: error,
            });
        },
    });
};

export const useAiAgentThreads = (
    agentUuid: string | undefined,
    allUsers?: boolean,
) => {
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentThreadSummaryListResponse['results'], ApiError>({
        queryKey: [
            AI_AGENTS_KEY,
            agentUuid,
            'threads',
            allUsers ? 'all' : 'user',
        ],
        queryFn: () => listAgentThreads(agentUuid!, allUsers),
        onError: (error) => {
            showToastApiError({
                title: 'Failed to fetch AI agent threads',
                apiError: error.error,
            });
        },
        enabled: !!agentUuid,
    });
};

export const useAiAgentThread = (
    agentUuid: string | undefined,
    threadUuid: string | null | undefined,
) => {
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentThreadResponse['results'], ApiError>({
        queryKey: [AI_AGENTS_KEY, agentUuid, 'threads', threadUuid],
        queryFn: () => getAgentThread(agentUuid!, threadUuid!),
        onError: (error) => {
            showToastApiError({
                title: 'Failed to fetch AI agent thread',
                apiError: error.error,
            });
        },
        enabled: !!agentUuid && !!threadUuid,
    });
};

const createOptimisticMessages = (
    threadUuid: string,
    prompt: string,
    user: UserWithAbility,
    agent: AiAgent,
) => {
    return [
        {
            role: 'user' as const,
            uuid: Math.random().toString(36),
            threadUuid,
            message: prompt,
            createdAt: new Date().toISOString(),
            user: {
                name: `${user?.firstName} ${user?.lastName}`,
                uuid: user?.userUuid ?? 'unknown',
            },
        },
        {
            role: 'assistant' as const,
            uuid: Math.random().toString(36),
            threadUuid,
            message: getOptimisticMessageStub(),
            createdAt: new Date().toISOString(),
            user: {
                name: agent?.name ?? 'Unknown',
                uuid: agent?.uuid ?? 'unknown',
            },
            vizConfigOutput: null,
            filtersOutput: null,
            metricQuery: null,
            humanScore: null,
            toolCalls: [],
        },
    ];
};

const createAgentThread = async (
    agentUuid: string | undefined,
    data: ApiAiAgentThreadCreateRequest,
) =>
    lightdashApi<ApiAiAgentThreadCreateResponse['results']>({
        url: `/aiAgents/${agentUuid}/threads`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateAgentThreadMutation = (
    agentUuid: string | undefined,
    projectUuid: string | undefined,
) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    const { user } = useApp();
    const { data: agent } = useProjectAiAgent(projectUuid, agentUuid);
    const { streamMessage } = useAiAgentThreadStreamMutation();

    return useMutation<
        ApiAiAgentThreadCreateResponse['results'],
        ApiError,
        ApiAiAgentThreadCreateRequest
    >({
        mutationFn: (data) =>
            agentUuid ? createAgentThread(agentUuid, data) : Promise.reject(),
        onSuccess: async (thread) => {
            // Invalidate both user-specific and all-users thread queries
            await queryClient.invalidateQueries({
                queryKey: [AI_AGENTS_KEY, agentUuid, 'threads'],
            });

            queryClient.setQueryData(
                [AI_AGENTS_KEY, agentUuid, 'threads', thread.uuid],
                () => {
                    if (!agentUuid) {
                        return undefined;
                    }

                    return {
                        createdFrom: 'web_app',
                        firstMessage: thread.firstMessage,
                        agentUuid: agentUuid,
                        uuid: thread.uuid,
                        messages: createOptimisticMessages(
                            thread.uuid,
                            thread.firstMessage,
                            user!.data!,
                            agent!,
                        ),
                        createdAt: new Date().toISOString(),
                        user: {
                            name: `${user?.data?.firstName} ${user?.data?.lastName}`,
                            uuid: user?.data?.userUuid ?? 'unknown',
                        },
                    } satisfies ApiAiAgentThreadResponse['results'];
                },
            );

            void streamMessage({
                agentUuid: thread.agentUuid,
                threadUuid: thread.uuid,
                onFinish: () =>
                    queryClient.invalidateQueries({
                        queryKey: [
                            AI_AGENTS_KEY,
                            agentUuid,
                            'threads',
                            thread.uuid,
                        ],
                    }),
            });

            void navigate(
                `/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${thread.uuid}`,
                {
                    viewTransition: true,
                },
            );
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to create AI agent',
                apiError: error,
            });
        },
    });
};

const createAgentThreadMessage = async (
    agentUuid: string,
    threadUuid: string,
    data: ApiAiAgentThreadMessageCreateRequest,
) =>
    lightdashApi<ApiAiAgentThreadMessageCreateResponse['results']>({
        url: `/aiAgents/${agentUuid}/threads/${threadUuid}/messages`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateAgentThreadMessageMutation = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
    threadUuid: string | undefined,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    const { user } = useApp();
    const { data: agent } = useProjectAiAgent(projectUuid, agentUuid);
    const { streamMessage } = useAiAgentThreadStreamMutation();

    return useMutation<
        ApiAiAgentThreadMessageCreateResponse['results'],
        ApiError,
        ApiAiAgentThreadMessageCreateRequest
    >({
        mutationFn: (data) =>
            agentUuid && threadUuid
                ? createAgentThreadMessage(agentUuid, threadUuid, data)
                : Promise.reject(),
        onMutate: (data) => {
            queryClient.setQueryData(
                [AI_AGENTS_KEY, agentUuid, 'threads', threadUuid],
                (
                    currentData:
                        | ApiAiAgentThreadResponse['results']
                        | undefined,
                ) => {
                    if (!currentData || !threadUuid) {
                        return currentData;
                    }

                    return {
                        ...currentData,
                        messages: [
                            ...currentData.messages,
                            ...createOptimisticMessages(
                                threadUuid,
                                data.prompt,
                                user!.data!,
                                agent!,
                            ),
                        ],
                    };
                },
            );
        },
        onSuccess: async () => {
            void streamMessage({
                agentUuid: agentUuid!,
                threadUuid: threadUuid!,
                onFinish: () =>
                    queryClient.invalidateQueries([
                        AI_AGENTS_KEY,
                        agentUuid,
                        'threads',
                        threadUuid,
                    ]),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to generate AI agent thread response',
                apiError: error,
            });
        },
    });
};

export const useAiAgentThreadMessageVizQuery = (args: {
    projectUuid: string | undefined;
    message: AiAgentMessageAssistant;
    agentUuid: string;
}) => {
    const health = useHealth();
    const org = useOrganization();
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentThreadMessageVizQuery, ApiError>({
        queryKey: [
            AI_AGENTS_KEY,
            args.agentUuid,
            'threads',
            args.message.threadUuid,
            'message',
            args.message.uuid,
            'viz-query',
        ],
        queryFn: () =>
            getAgentThreadMessageVizQuery({
                agentUuid: args.agentUuid,
                threadUuid: args.message.threadUuid,
                messageUuid: args.message.uuid,
            }),
        onError: (error: ApiError) => {
            showToastApiError({
                title: 'Failed to fetch visualization',
                apiError: error.error,
            });
        },
        enabled:
            !!args.message.metricQuery &&
            !!args.message.vizConfigOutput &&
            !!args.projectUuid &&
            !!health.data &&
            !!org.data,
    });
};

const updatePromptFeedback = async (messageUuid: string, humanScore: number) =>
    lightdashApi<ApiSuccessEmpty>({
        url: `/aiAgents/messages/${messageUuid}/feedback`,
        method: 'PATCH',
        body: JSON.stringify({ humanScore }),
    });

export const useUpdatePromptFeedbackMutation = (
    agentUuid: string | undefined,
    threadUuid: string,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();

    return useMutation<
        ApiSuccessEmpty,
        ApiError,
        { messageUuid: string; humanScore: number }
    >({
        mutationFn: ({ messageUuid, humanScore }) =>
            updatePromptFeedback(messageUuid, humanScore),
        onMutate: ({ messageUuid, humanScore }) => {
            queryClient.setQueryData(
                [AI_AGENTS_KEY, agentUuid, 'threads', threadUuid],
                (
                    currentData:
                        | ApiAiAgentThreadResponse['results']
                        | undefined,
                ) => {
                    if (!currentData) return currentData;

                    return {
                        ...currentData,
                        messages: currentData.messages.map((message) =>
                            message.uuid === messageUuid
                                ? {
                                      ...message,
                                      humanScore,
                                  }
                                : message,
                        ),
                    };
                },
            );
        },
        onSuccess: () => {
            // Invalidate relevant queries to refresh the data
            void queryClient.invalidateQueries({
                queryKey: [AI_AGENTS_KEY, agentUuid, 'threads', threadUuid],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to submit feedback',
                apiError: error,
            });
        },
    });
};
