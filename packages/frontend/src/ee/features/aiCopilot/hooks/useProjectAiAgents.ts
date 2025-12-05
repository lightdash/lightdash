import type {
    AiAgent,
    ApiAiAgentResponse,
    ApiAiAgentSummaryResponse,
    ApiAiAgentThreadCreateRequest,
    ApiAiAgentThreadCreateResponse,
    ApiAiAgentThreadGenerateTitleResponse,
    ApiAiAgentThreadMessageCreateRequest,
    ApiAiAgentThreadMessageCreateResponse,
    ApiAiAgentThreadMessageVizQuery,
    ApiAiAgentThreadResponse,
    ApiAiAgentThreadSummaryListResponse,
    ApiAiAgentVerifiedQuestionsResponse,
    ApiAppendInstructionRequest,
    ApiAppendInstructionResponse,
    ApiCreateAiAgent,
    ApiCreateAiAgentResponse,
    ApiError,
    ApiRevertChangeRequest,
    ApiRevertChangeResponse,
    ApiSuccessEmpty,
    ApiUpdateAiAgent,
} from '@lightdash/common';
import { nanoid } from '@reduxjs/toolkit';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { lightdashApi } from '../../../../api';
import useHealth from '../../../../hooks/health/useHealth';
import { useOrganization } from '../../../../hooks/organization/useOrganization';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useActiveProject } from '../../../../hooks/useActiveProject';
import { type UserWithAbility } from '../../../../hooks/user/useUser';
import useApp from '../../../../providers/App/useApp';
import { useAiAgentThreadStreamMutation } from '../streaming/useAiAgentThreadStreamMutation';
import { USER_AGENT_PREFERENCES } from './useUserAgentPreferences';

const PROJECT_AI_AGENTS_KEY = 'projectAiAgents';
const AI_AGENTS_KEY = 'aiAgents';

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

type UseProjectAiAgentsProps = {
    projectUuid?: string | null;
    options?: UseQueryOptions<ApiAiAgentSummaryResponse['results'], ApiError>;
    redirectOnUnauthorized: boolean;
};

export const useProjectAiAgents = ({
    projectUuid,
    options,
    redirectOnUnauthorized,
}: UseProjectAiAgentsProps) => {
    const navigate = useNavigate();
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentSummaryResponse['results'], ApiError>({
        queryKey: [PROJECT_AI_AGENTS_KEY, projectUuid],
        queryFn: () => listProjectAgents(projectUuid!),
        ...options,
        onError: (error) => {
            if (error.error?.statusCode !== 403) {
                showToastApiError({
                    title: 'Failed to fetch project AI agents',
                    apiError: error.error,
                });
            } else if (redirectOnUnauthorized) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            }
        },
        enabled: !!projectUuid && options?.enabled !== false,
    });
};

export const useProjectAiAgent = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
) => {
    const navigate = useNavigate();
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentResponse['results'], ApiError>({
        queryKey: [PROJECT_AI_AGENTS_KEY, projectUuid, agentUuid],
        queryFn: () => getProjectAgent(projectUuid!, agentUuid!),
        onError: (error) => {
            if (error.error?.statusCode === 403) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            } else {
                showToastApiError({
                    title: `Failed to fetch project AI agent details`,
                    apiError: error.error,
                });
            }
        },
        enabled: !!projectUuid && !!agentUuid,
        retry: (failureCount, error) => {
            // Don't retry permission errors
            if (error.error?.statusCode === 403) {
                return false;
            }
            return failureCount < 3;
        },
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

const deleteAgent = async (projectUuid: string, agentUuid: string) =>
    lightdashApi<ApiSuccessEmpty>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteAiAgentMutation = (projectUuid: string) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<ApiSuccessEmpty, ApiError, string>({
        mutationFn: (agentUuid) => deleteAgent(projectUuid, agentUuid),
        onSuccess: async () => {
            showToastSuccess({
                title: 'AI agent deleted successfully',
            });
            await Promise.all(
                [
                    // Invalidates Project queries
                    [PROJECT_AI_AGENTS_KEY, projectUuid],
                    // Invalidates AI Agent queries for this project
                    [AI_AGENTS_KEY, projectUuid],
                    // Invalidates User Preferences queries
                    [USER_AGENT_PREFERENCES, projectUuid],
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
                queryKey: [USER_AGENT_PREFERENCES, projectUuid],
                exact: true,
            });
            void navigate(`/projects/${projectUuid}/ai-agents`);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to delete AI agent',
                apiError: error,
            });
        },
    });
};

// Thread-related functionality
const listAgentThreads = async (
    projectUuid: string,
    agentUuid: string,
    allUsers?: boolean,
) => {
    const searchParams = new URLSearchParams();
    if (allUsers) {
        searchParams.set('allUsers', 'true');
    }

    const queryString = searchParams.toString();
    const url = `/projects/${projectUuid}/aiAgents/${agentUuid}/threads${
        queryString ? `?${queryString}` : ''
    }`;

    return lightdashApi<ApiAiAgentThreadSummaryListResponse['results']>({
        url,
        method: 'GET',
        body: undefined,
    });
};

const getAgentThread = async (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
) =>
    lightdashApi<ApiAiAgentThreadResponse['results']>({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/threads/${threadUuid}`,
        method: 'GET',
        body: undefined,
    });

export const useAiAgentThreads = (
    projectUuid: string,
    agentUuid: string,
    allUsers?: boolean,
) => {
    const navigate = useNavigate();
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentThreadSummaryListResponse['results'], ApiError>({
        queryKey: [
            AI_AGENTS_KEY,
            projectUuid,
            agentUuid,
            'threads',
            allUsers ? 'all' : 'user',
        ],
        queryFn: () => listAgentThreads(projectUuid, agentUuid, allUsers),
        onError: (error) => {
            if (error.error?.statusCode === 403) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            }
            // Don't show error toast for permission errors - let the UI handle it gracefully
            if (error.error?.statusCode !== 403) {
                showToastApiError({
                    title: 'Failed to fetch AI agent threads',
                    apiError: error.error,
                });
            }
        },
        enabled: !!agentUuid,
    });
};

export const useAiAgentThread = (
    projectUuid: string,
    agentUuid: string | undefined,
    threadUuid: string | null | undefined,
    options?: UseQueryOptions<ApiAiAgentThreadResponse['results'], ApiError>,
) => {
    const { showToastApiError } = useToaster();
    const navigate = useNavigate();

    return useQuery<ApiAiAgentThreadResponse['results'], ApiError>({
        queryKey: [
            AI_AGENTS_KEY,
            projectUuid,
            agentUuid,
            'threads',
            threadUuid,
        ],
        queryFn: () => {
            return getAgentThread(projectUuid, agentUuid!, threadUuid!);
        },
        onError: (error) => {
            if (error.error?.statusCode === 403) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            } else {
                showToastApiError({
                    title: 'Failed to fetch AI agent thread',
                    apiError: error.error,
                });
            }
        },
        enabled: !!agentUuid && !!threadUuid,
        ...options,
    });
};

// Helper functions for thread creation
const createOptimisticMessages = (
    threadUuid: string,
    promptUuid: string,
    prompt: string,
    user: UserWithAbility,
    agent: AiAgent,
) => {
    return [
        {
            role: 'user' as const,
            uuid: promptUuid,
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
            status: 'pending' as const,
            uuid: promptUuid,
            threadUuid,
            message: '',
            createdAt: new Date().toISOString(),
            user: {
                name: agent?.name ?? 'Unknown',
                uuid: agent?.uuid ?? 'unknown',
            },
            vizConfigOutput: null,
            filtersOutput: null,
            metricQuery: null,
            humanScore: null,
            humanFeedback: null,
            toolCalls: [],
            toolResults: [],
            reasoning: [],
            savedQueryUuid: null,
            artifacts: null,
            referencedArtifacts: null,
            modelConfig: null,
        },
    ];
};

const generateAgentThreadTitle = async (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
) =>
    lightdashApi<ApiAiAgentThreadGenerateTitleResponse['results']>({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/threads/${threadUuid}/generate-title`,
        method: 'POST',
        body: JSON.stringify({}),
    });

const useGenerateAgentThreadTitleMutation = (
    projectUuid: string,
    agentUuid: string,
) => {
    const queryClient = useQueryClient();
    return useMutation<
        ApiAiAgentThreadGenerateTitleResponse['results'],
        ApiError,
        { threadUuid: string }
    >({
        mutationFn: ({ threadUuid }) =>
            generateAgentThreadTitle(projectUuid, agentUuid, threadUuid),
        onSuccess: (data, { threadUuid }) => {
            queryClient.setQueryData(
                [AI_AGENTS_KEY, projectUuid, agentUuid, 'threads', 'user'],
                (
                    currentData:
                        | ApiAiAgentThreadSummaryListResponse['results']
                        | undefined,
                ) => {
                    if (!currentData) return currentData;
                    return currentData.map((thread) =>
                        thread.uuid === threadUuid
                            ? { ...thread, title: data.title }
                            : thread,
                    );
                },
            );
        },
        onError: ({ error }) => {
            // Silently fail - don't show error toast or navigate for background title generation
            console.warn('Failed to generate thread title:', error);
        },
    });
};

const createAgentThread = async (
    projectUuid: string,
    agentUuid: string | undefined,
    data: ApiAiAgentThreadCreateRequest,
) =>
    lightdashApi<ApiAiAgentThreadCreateResponse['results']>({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/threads`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateAgentThreadMutation = (
    agentUuid: string | undefined,
    projectUuid: string,
) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    const { user } = useApp();
    const { data: agent } = useProjectAiAgent(projectUuid, agentUuid);
    const { streamMessage } = useAiAgentThreadStreamMutation();
    const { mutateAsync: generateThreadTitle } =
        useGenerateAgentThreadTitleMutation(projectUuid!, agentUuid!);

    return useMutation<
        ApiAiAgentThreadCreateResponse['results'],
        ApiError,
        ApiAiAgentThreadCreateRequest
    >({
        mutationFn: (data) =>
            agentUuid
                ? createAgentThread(projectUuid, agentUuid, data)
                : Promise.reject(),
        onSuccess: async (thread) => {
            // Invalidate both user-specific and all-users thread queries
            await queryClient.invalidateQueries({
                queryKey: [AI_AGENTS_KEY, projectUuid, agentUuid, 'threads'],
            });

            void generateThreadTitle({ threadUuid: thread.uuid });

            queryClient.setQueryData(
                [AI_AGENTS_KEY, projectUuid, agentUuid, 'threads', thread.uuid],
                () => {
                    if (!agentUuid) {
                        return undefined;
                    }

                    return {
                        createdFrom: 'web_app',
                        firstMessage: thread.firstMessage,
                        agentUuid: agentUuid,
                        uuid: thread.uuid,
                        title: null,
                        titleGeneratedAt: null,
                        messages: createOptimisticMessages(
                            thread.uuid,
                            thread.firstMessage.uuid,
                            thread.firstMessage.message,
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
                projectUuid,
                agentUuid: thread.agentUuid,
                threadUuid: thread.uuid,
                messageUuid: thread.firstMessage.uuid,
                onFinish: () =>
                    queryClient.invalidateQueries({
                        queryKey: [
                            AI_AGENTS_KEY,
                            projectUuid,
                            agentUuid,
                            'threads',
                            thread.uuid,
                        ],
                    }),
                refetchThread: () =>
                    queryClient.invalidateQueries({
                        queryKey: [
                            AI_AGENTS_KEY,
                            projectUuid,
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
            if (error?.statusCode === 403) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            } else {
                showToastApiError({
                    title: 'Failed to create AI agent',
                    apiError: error,
                });
            }
        },
    });
};

const createAgentThreadMessage = async (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
    data: ApiAiAgentThreadMessageCreateRequest,
) =>
    lightdashApi<ApiAiAgentThreadMessageCreateResponse['results']>({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/threads/${threadUuid}/messages`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useCreateAgentThreadMessageMutation = (
    projectUuid: string,
    agentUuid: string | undefined,
    threadUuid: string | undefined,
) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    const { user } = useApp();
    const { data: agent } = useProjectAiAgent(projectUuid, agentUuid);
    const { streamMessage } = useAiAgentThreadStreamMutation();

    return useMutation<
        ApiAiAgentThreadMessageCreateResponse['results'],
        ApiError,
        ApiAiAgentThreadMessageCreateRequest,
        { messageUuid: string }
    >({
        mutationFn: (data) =>
            agentUuid && threadUuid
                ? createAgentThreadMessage(
                      projectUuid,
                      agentUuid,
                      threadUuid,
                      data,
                  )
                : Promise.reject(),
        onMutate: (data) => {
            // Temporary uuid for optimistic messages
            const messageUuid = nanoid();

            queryClient.setQueryData(
                [AI_AGENTS_KEY, projectUuid, agentUuid, 'threads', threadUuid],
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
                                messageUuid,
                                data.prompt,
                                user!.data!,
                                agent!,
                            ),
                        ],
                    };
                },
            );

            return { messageUuid };
        },
        onSuccess: (data, _vars, context) => {
            queryClient.setQueryData(
                [AI_AGENTS_KEY, projectUuid, agentUuid, 'threads', threadUuid],
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
                        messages: currentData.messages.map((message) =>
                            message.uuid === context?.messageUuid
                                ? {
                                      ...message,
                                      uuid: data.uuid,
                                  }
                                : message,
                        ),
                    };
                },
            );

            void streamMessage({
                projectUuid,
                agentUuid: agentUuid!,
                threadUuid: threadUuid!,
                messageUuid: data.uuid,
                onFinish: () =>
                    queryClient.invalidateQueries([
                        AI_AGENTS_KEY,
                        projectUuid,
                        agentUuid,
                        'threads',
                        threadUuid,
                    ]),
                refetchThread: () =>
                    queryClient.invalidateQueries({
                        queryKey: [
                            AI_AGENTS_KEY,
                            projectUuid,
                            agentUuid,
                            'threads',
                            threadUuid,
                        ],
                    }),
            });
        },
        onError: ({ error }) => {
            if (error?.statusCode === 403) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            } else {
                showToastApiError({
                    title: 'Failed to generate AI agent thread response',
                    apiError: error,
                });
            }
        },
    });
};

export const useRetryAiAgentThreadMessageMutation = () => {
    const { streamMessage } = useAiAgentThreadStreamMutation();
    const queryClient = useQueryClient();

    return useMutation<
        void,
        void,
        {
            projectUuid: string;
            agentUuid: string;
            threadUuid: string;
            messageUuid: string;
        }
    >({
        mutationFn: ({ projectUuid, agentUuid, threadUuid, messageUuid }) =>
            streamMessage({
                projectUuid,
                agentUuid: agentUuid,
                threadUuid: threadUuid,
                messageUuid: messageUuid,
                refetchThread: () =>
                    queryClient.invalidateQueries({
                        queryKey: [
                            AI_AGENTS_KEY,
                            projectUuid,
                            agentUuid,
                            'threads',
                            threadUuid,
                        ],
                    }),
            }),
        onSettled: (_, __, { projectUuid, agentUuid, threadUuid }) => {
            void queryClient.invalidateQueries([
                AI_AGENTS_KEY,
                projectUuid,
                agentUuid,
                'threads',
                threadUuid,
            ]);
        },
    });
};

// Feedback and query management functionality
const updatePromptFeedback = async (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
    messageUuid: string,
    humanScore: number,
    humanFeedback?: string | null,
) =>
    lightdashApi<ApiSuccessEmpty>({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/threads/${threadUuid}/messages/${messageUuid}/feedback`,
        method: 'PATCH',
        body: JSON.stringify({ humanScore, humanFeedback }),
    });

export const useUpdatePromptFeedbackMutation = (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    const navigate = useNavigate();

    return useMutation<
        ApiSuccessEmpty,
        ApiError,
        {
            messageUuid: string;
            humanScore: number;
            humanFeedback?: string | null;
        }
    >({
        mutationFn: ({ messageUuid, humanScore, humanFeedback }) =>
            updatePromptFeedback(
                projectUuid,
                agentUuid,
                threadUuid,
                messageUuid,
                humanScore,
                humanFeedback,
            ),
        onMutate: ({ messageUuid, humanScore, humanFeedback }) => {
            queryClient.setQueryData(
                [AI_AGENTS_KEY, projectUuid, agentUuid, 'threads', threadUuid],
                (
                    currentData:
                        | ApiAiAgentThreadResponse['results']
                        | undefined,
                ) => {
                    if (!currentData) return currentData;

                    return {
                        ...currentData,
                        messages: currentData.messages.map((message) => {
                            if (message.uuid !== messageUuid) {
                                return message;
                            }

                            if (message.role !== 'assistant') {
                                return message;
                            }

                            return {
                                ...message,
                                humanScore,
                                humanFeedback:
                                    humanScore === -1
                                        ? humanFeedback ?? null
                                        : null,
                            };
                        }),
                    };
                },
            );
        },
        onError: ({ error }) => {
            if (error?.statusCode === 403) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            } else {
                showToastApiError({
                    title: 'Failed to submit feedback',
                    apiError: error,
                });
            }
        },
    });
};

const savePromptQuery = async ({
    projectUuid,
    agentUuid,
    threadUuid,
    messageUuid,
    savedQueryUuid,
}: {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    messageUuid: string;
    savedQueryUuid: string | null;
}) =>
    lightdashApi<ApiSuccessEmpty>({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/threads/${threadUuid}/messages/${messageUuid}/savedQuery`,
        method: `PATCH`,
        body: JSON.stringify({
            savedQueryUuid,
        }),
    });

export const useSavePromptQuery = (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
    messageUuid: string,
) => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { showToastApiError } = useToaster();

    return useMutation<
        ApiSuccessEmpty,
        ApiError,
        { savedQueryUuid: string | null }
    >({
        mutationFn: ({ savedQueryUuid }) => {
            return savePromptQuery({
                projectUuid,
                agentUuid,
                threadUuid,
                messageUuid,
                savedQueryUuid,
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: [
                    AI_AGENTS_KEY,
                    projectUuid,
                    agentUuid,
                    'threads',
                    threadUuid,
                ],
            });
        },
        onError: ({ error }) => {
            if (error?.statusCode === 403) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            } else {
                showToastApiError({
                    title: 'Failed to save prompt query',
                    apiError: error,
                });
            }
        },
    });
};

const revertChange = async ({
    projectUuid,
    agentUuid,
    threadUuid,
    promptUuid,
    changeUuid,
}: {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    changeUuid: string;
}) =>
    lightdashApi<ApiRevertChangeResponse>({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/threads/${threadUuid}/messages/${promptUuid}/revert-change`,
        method: 'POST',
        body: JSON.stringify({
            changeUuid,
        } satisfies ApiRevertChangeRequest),
    });

export const useRevertChangeMutation = (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
) => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiRevertChangeResponse,
        ApiError,
        { promptUuid: string; changeUuid: string }
    >({
        mutationFn: ({ promptUuid, changeUuid }) => {
            return revertChange({
                projectUuid,
                agentUuid,
                threadUuid,
                promptUuid,
                changeUuid,
            });
        },
        onSuccess: () => {
            showToastSuccess({
                title: 'Change reverted successfully',
            });
            void queryClient.invalidateQueries([
                AI_AGENTS_KEY,
                projectUuid,
                agentUuid,
                'threads',
                threadUuid,
            ]);
        },
        onError: ({ error }) => {
            if (error?.statusCode === 403) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            } else {
                showToastApiError({
                    title: 'Failed to revert change',
                    apiError: error,
                });
            }
        },
    });
};

const updateArtifactVersion = async ({
    projectUuid,
    agentUuid,
    artifactUuid,
    versionUuid,
    savedDashboardUuid,
}: {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    savedDashboardUuid: string | null;
}) =>
    lightdashApi<ApiSuccessEmpty>({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/artifacts/${artifactUuid}/versions/${versionUuid}/savedDashboard`,
        method: `PATCH`,
        body: JSON.stringify({
            savedDashboardUuid,
        }),
    });

export const useUpdateArtifactVersion = (
    projectUuid: string,
    agentUuid: string,
    artifactUuid: string,
    versionUuid: string,
) => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { showToastApiError } = useToaster();

    return useMutation<
        ApiSuccessEmpty,
        ApiError,
        { savedDashboardUuid: string | null }
    >({
        mutationFn: ({ savedDashboardUuid }) => {
            return updateArtifactVersion({
                projectUuid,
                agentUuid,
                artifactUuid,
                versionUuid,
                savedDashboardUuid,
            });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: [
                    AI_AGENTS_KEY,
                    projectUuid,
                    agentUuid,
                    'artifacts',
                    artifactUuid,
                ],
            });
        },
        onError: ({ error }) => {
            if (error?.statusCode === 403) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            } else {
                showToastApiError({
                    title: 'Failed to save artifact dashboard',
                    apiError: error,
                });
            }
        },
    });
};

// Artifact functionality
const getAiAgentArtifactVizQuery = async (args: {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
}) =>
    lightdashApi<ApiAiAgentThreadMessageVizQuery>({
        url: `/projects/${args.projectUuid}/aiAgents/${args.agentUuid}/artifacts/${args.artifactUuid}/versions/${args.versionUuid}/viz-query`,
        method: 'GET',
        body: undefined,
    });

export const useAiAgentArtifactVizQuery = (
    {
        projectUuid,
        agentUuid,
        artifactUuid,
        versionUuid,
    }: {
        projectUuid: string;
        agentUuid: string;
        artifactUuid: string;
        versionUuid: string;
    },
    useQueryOptions?: UseQueryOptions<
        ApiAiAgentThreadMessageVizQuery,
        ApiError
    >,
) => {
    const navigate = useNavigate();
    const { data: activeProjectUuid } = useActiveProject();
    const health = useHealth();
    const org = useOrganization();
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentThreadMessageVizQuery, ApiError>({
        queryKey: [
            AI_AGENTS_KEY,
            'artifact-viz-query',
            projectUuid,
            agentUuid,
            'artifacts',
            artifactUuid,
            'versions',
            versionUuid,
        ],
        ...useQueryOptions,
        queryFn: () => {
            return getAiAgentArtifactVizQuery({
                projectUuid,
                agentUuid,
                artifactUuid,
                versionUuid,
            });
        },
        onError: (error: ApiError) => {
            if (error.error?.statusCode === 403) {
                void navigate(
                    `/projects/${activeProjectUuid}/ai-agents/not-authorized`,
                );
            } else {
                showToastApiError({
                    title: 'Failed to fetch artifact visualization',
                    apiError: error.error,
                });
            }
            useQueryOptions?.onError?.(error);
        },
        enabled: !!health.data && !!org.data && useQueryOptions?.enabled,
    });
};

// Dashboard chart visualization query functionality
const getAiAgentDashboardChartVizQuery = async (args: {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    chartIndex: number;
}) =>
    lightdashApi<ApiAiAgentThreadMessageVizQuery>({
        url: `/projects/${args.projectUuid}/aiAgents/${args.agentUuid}/artifacts/${args.artifactUuid}/versions/${args.versionUuid}/charts/${args.chartIndex}/viz-query`,
        method: 'GET',
        body: undefined,
    });

export const getAiAgentDashboardChartVizQueryKey = (args: {
    projectUuid: string;
    agentUuid: string;
    artifactUuid: string;
    versionUuid: string;
    chartIndex: number;
}) => [
    AI_AGENTS_KEY,
    'dashboard-chart-viz-query',
    args.projectUuid,
    args.agentUuid,
    'artifacts',
    args.artifactUuid,
    'versions',
    args.versionUuid,
    'charts',
    args.chartIndex,
];

export const useAiAgentDashboardChartVizQuery = (
    {
        projectUuid,
        agentUuid,
        artifactUuid,
        versionUuid,
        chartIndex,
    }: {
        projectUuid: string;
        agentUuid: string;
        artifactUuid: string;
        versionUuid: string;
        chartIndex: number;
    },
    useQueryOptions?: UseQueryOptions<
        ApiAiAgentThreadMessageVizQuery,
        ApiError
    >,
) => {
    const navigate = useNavigate();
    const { data: activeProjectUuid } = useActiveProject();
    const health = useHealth();
    const org = useOrganization();
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentThreadMessageVizQuery, ApiError>({
        queryKey: getAiAgentDashboardChartVizQueryKey({
            projectUuid,
            agentUuid,
            artifactUuid,
            versionUuid,
            chartIndex,
        }),
        ...useQueryOptions,
        queryFn: () => {
            return getAiAgentDashboardChartVizQuery({
                projectUuid,
                agentUuid,
                artifactUuid,
                versionUuid,
                chartIndex,
            });
        },
        onError: (error: ApiError) => {
            if (error.error?.statusCode === 403) {
                void navigate(
                    `/projects/${activeProjectUuid}/ai-agents/not-authorized`,
                );
            } else {
                showToastApiError({
                    title: 'Failed to fetch dashboard chart visualization',
                    apiError: error.error,
                });
            }
            useQueryOptions?.onError?.(error);
        },
        enabled: !!health.data && !!org.data && useQueryOptions?.enabled,
    });
};

const appendInstruction = async (
    projectUuid: string,
    agentUuid: string,
    data: ApiAppendInstructionRequest,
) =>
    lightdashApi<ApiAppendInstructionResponse['results']>({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/append-instruction`,
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useAppendInstructionMutation = (
    projectUuid: string,
    agentUuid: string,
) => {
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        ApiAppendInstructionResponse['results'],
        ApiError,
        ApiAppendInstructionRequest
    >({
        mutationFn: (data) => appendInstruction(projectUuid, agentUuid, data),
        onSuccess: () => {
            showToastSuccess({
                title: 'Instruction saved successfully',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to save instruction',
                apiError: error,
            });
        },
    });
};

const getVerifiedQuestions = async (
    projectUuid: string,
    agentUuid: string,
): Promise<ApiAiAgentVerifiedQuestionsResponse['results']> =>
    lightdashApi<ApiAiAgentVerifiedQuestionsResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/verified-questions`,
        method: 'GET',
        body: undefined,
    });

export const useVerifiedQuestions = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
) => {
    return useQuery<ApiAiAgentVerifiedQuestionsResponse['results'], ApiError>({
        queryKey: [AI_AGENTS_KEY, projectUuid, agentUuid, 'verified-questions'],
        queryFn: () => getVerifiedQuestions(projectUuid!, agentUuid!),
        enabled: !!projectUuid && !!agentUuid,
    });
};
