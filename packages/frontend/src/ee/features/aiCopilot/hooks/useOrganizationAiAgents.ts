import type {
    AiAgent,
    AiAgentMessageAssistant,
    ApiAiAgentResponse,
    ApiAiAgentStartThreadResponse,
    ApiAiAgentSummaryResponse,
    ApiAiAgentThreadGenerateRequest,
    ApiAiAgentThreadGenerateResponse,
    ApiAiAgentThreadMessageViz,
    ApiAiAgentThreadResponse,
    ApiAiAgentThreadSummaryListResponse,
    ApiCreateAiAgent,
    ApiCreateAiAgentResponse,
    ApiError,
    ApiSuccessEmpty,
    ApiUpdateAiAgent,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { lightdashApi } from '../../../../api';
import { pollJobStatus } from '../../../../features/scheduler/hooks/useScheduler';
import useHealth from '../../../../hooks/health/useHealth';
import { useOrganization } from '../../../../hooks/organization/useOrganization';
import useToaster from '../../../../hooks/toaster/useToaster';
import { type UserWithAbility } from '../../../../hooks/user/useUser';
import useApp from '../../../../providers/App/useApp';
import { getChartVisualizationFromAiQuery } from '../utils/getChartVisualizationFromAiQuery';
import { useProjectAiAgent } from './useProjectAiAgents';

const AI_AGENTS_KEY = 'aiAgents';

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
    lightdashApi<ApiCreateAiAgentResponse['results']>({
        version: 'v1',
        url: `/aiAgents`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateAgent = async (data: ApiUpdateAiAgent) =>
    lightdashApi<ApiAiAgentResponse['results']>({
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

const getAgentThreadMessageViz = async (args: {
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
}) =>
    lightdashApi<ApiAiAgentThreadMessageViz>({
        url: `/aiAgents/${args.agentUuid}/threads/${args.threadUuid}/message/${args.messageUuid}/viz`,
        method: 'GET',
        body: undefined,
    });

export const useAiAgents = () => {
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentSummaryResponse['results'], ApiError>({
        queryKey: [AI_AGENTS_KEY],
        queryFn: listAgents,
        onError: (error) => {
            showToastApiError({
                title: 'Failed to fetch AI agents',
                apiError: error.error,
            });
        },
    });
};

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

export const useCreateAiAgentMutation = () => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiCreateAiAgentResponse['results'],
        ApiError,
        ApiCreateAiAgent
    >({
        mutationFn: createAgent,
        onSuccess: () => {
            showToastSuccess({
                title: 'AI agent created successfully',
            });
            void queryClient.invalidateQueries({ queryKey: [AI_AGENTS_KEY] });
            void navigate('/generalSettings/aiAgents');
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to create AI agent',
                apiError: error,
            });
        },
    });
};

export const useUpdateAiAgentMutation = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiAiAgentResponse['results'],
        ApiError,
        ApiUpdateAiAgent
    >({
        mutationFn: (data) => updateAgent(data),
        onSuccess: async (data) => {
            showToastSuccess({
                title: 'AI agent updated successfully',
            });
            await queryClient.invalidateQueries({
                queryKey: [AI_AGENTS_KEY, data.uuid],
            });
            await queryClient.invalidateQueries({
                queryKey: [AI_AGENTS_KEY],
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

const deleteAgent = async (agentUuid: string) =>
    lightdashApi<ApiSuccessEmpty>({
        version: 'v1',
        url: `/aiAgents/${agentUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteAiAgentMutation = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<ApiSuccessEmpty, ApiError, string>({
        mutationFn: (agentUuid) => deleteAgent(agentUuid),
        onSuccess: () => {
            showToastSuccess({
                title: 'AI agent deleted successfully',
            });
            void queryClient.invalidateQueries({
                queryKey: [AI_AGENTS_KEY],
                exact: true,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to delete AI agent',
                apiError: error,
            });
        },
    });
};

export const useAiAgentThreads = (agentUuid: string | undefined) => {
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentThreadSummaryListResponse['results'], ApiError>({
        queryKey: [AI_AGENTS_KEY, agentUuid, 'threads'],
        queryFn: () => listAgentThreads(agentUuid!),
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
            message: 'Thinking...',
            createdAt: new Date().toISOString(),
            user: {
                name: agent?.name ?? 'Unknown',
                uuid: agent?.uuid ?? 'unknown',
            },
        },
    ];
};

const startAgentThread = async (
    agentUuid: string | undefined,
    data: ApiAiAgentThreadGenerateRequest,
) =>
    lightdashApi<ApiAiAgentStartThreadResponse['results']>({
        url: `/aiAgents/${agentUuid}/generate`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useStartAgentThreadMutation = (
    agentUuid: string | undefined,
    projectUuid: string | undefined,
) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    const { user } = useApp();
    const { data: agent } = useProjectAiAgent(projectUuid, agentUuid);

    return useMutation<
        ApiAiAgentStartThreadResponse['results'],
        ApiError,
        ApiAiAgentThreadGenerateRequest
    >({
        mutationFn: (data) =>
            agentUuid ? startAgentThread(agentUuid, data) : Promise.reject(),
        onSuccess: async (data, variables) => {
            await queryClient.invalidateQueries({
                queryKey: [AI_AGENTS_KEY, agentUuid, 'threads'],
            });

            queryClient.setQueryData(
                [AI_AGENTS_KEY, agentUuid, 'threads', data.threadUuid],
                () => {
                    if (!agentUuid) {
                        return undefined;
                    }

                    return {
                        createdFrom: 'web_app',
                        firstMessage: variables.prompt,
                        agentUuid: agentUuid,
                        uuid: data.threadUuid,
                        messages: createOptimisticMessages(
                            data.threadUuid,
                            variables.prompt,
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

            void pollJobStatus(data.jobId).then(() =>
                queryClient.invalidateQueries({
                    queryKey: [
                        AI_AGENTS_KEY,
                        agentUuid,
                        'threads',
                        data.threadUuid,
                    ],
                }),
            );

            void navigate(
                `/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${data.threadUuid}`,
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

const generateAgentThreadResponse = async (
    agentUuid: string,
    threadUuid: string,
    data: ApiAiAgentThreadGenerateRequest,
) =>
    lightdashApi<ApiAiAgentThreadGenerateResponse['results']>({
        url: `/aiAgents/${agentUuid}/threads/${threadUuid}/generate`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useGenerateAgentThreadResponseMutation = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
    threadUuid: string | undefined,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    const { user } = useApp();
    const { data: agent } = useProjectAiAgent(projectUuid, agentUuid);

    return useMutation<
        ApiAiAgentThreadGenerateResponse['results'],
        ApiError,
        ApiAiAgentThreadGenerateRequest
    >({
        mutationFn: (data) =>
            agentUuid && threadUuid
                ? generateAgentThreadResponse(agentUuid, threadUuid, data)
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
        onSuccess: async (data) => {
            await pollJobStatus(data.jobId);
            await queryClient.invalidateQueries([
                AI_AGENTS_KEY,
                agentUuid,
                'threads',
                threadUuid,
            ]);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to generate AI agent thread response',
                apiError: error,
            });
        },
    });
};

export const useAiAgentThreadMessageViz = (args: {
    activeProjectUuid: string | undefined;
    message: AiAgentMessageAssistant;
    agentUuid: string;
}) => {
    const health = useHealth();
    const org = useOrganization();
    const { showToastApiError } = useToaster();

    return useQuery<
        ApiAiAgentThreadMessageViz,
        ApiError,
        ReturnType<typeof getChartVisualizationFromAiQuery>
    >({
        queryKey: [
            AI_AGENTS_KEY,
            args.agentUuid,
            'threads',
            args.message.threadUuid,
            'message',
            args.message.uuid,
            'viz',
        ],
        queryFn: () =>
            getAgentThreadMessageViz({
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
            !!args.activeProjectUuid &&
            !!health.data &&
            !!org.data,
        select: (data: ApiAiAgentThreadMessageViz) =>
            getChartVisualizationFromAiQuery(
                data,
                health.data!,
                org.data!,
                args.activeProjectUuid,
            ),
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
