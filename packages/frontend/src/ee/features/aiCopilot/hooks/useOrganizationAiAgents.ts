import type {
    AiAgent,
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
import { PROJECT_AI_AGENTS_KEY, useProjectAiAgent } from './useProjectAiAgents';
import { USER_AGENT_PREFERENCES } from './useUserAgentPreferences';

const AI_AGENTS_KEY = 'aiAgents';
// API calls

const getAgent = async (
    projectUuid: string,
    agentUuid: string,
): Promise<ApiAiAgentResponse['results']> => {
    return lightdashApi<ApiAiAgentResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}`,
        method: 'GET',
        body: undefined,
    });
};

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

export const useAiAgent = (projectUuid: string, agentUuid: string) => {
    const { showToastApiError } = useToaster();
    const navigate = useNavigate();

    return useQuery<ApiAiAgentResponse['results'], ApiError>({
        queryKey: [AI_AGENTS_KEY, projectUuid, agentUuid],
        queryFn: () => getAgent(projectUuid, agentUuid!),
        onError: (error) => {
            if (error.error?.statusCode === 403) {
                void navigate(
                    `/projects/${projectUuid}/ai-agents/not-authorized`,
                );
            } else {
                showToastApiError({
                    title: `Failed to fetch AI agent details`,
                    apiError: error.error,
                });
            }
        },
        enabled: !!agentUuid,
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
            toolCalls: [],
            savedQueryUuid: null,
            artifact: null,
        },
    ];
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

const updatePromptFeedback = async (
    projectUuid: string,
    agentUuid: string,
    threadUuid: string,
    messageUuid: string,
    humanScore: number,
) =>
    lightdashApi<ApiSuccessEmpty>({
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/threads/${threadUuid}/messages/${messageUuid}/feedback`,
        method: 'PATCH',
        body: JSON.stringify({ humanScore }),
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
        { messageUuid: string; humanScore: number }
    >({
        mutationFn: ({ messageUuid, humanScore }) =>
            updatePromptFeedback(
                projectUuid,
                agentUuid,
                threadUuid,
                messageUuid,
                humanScore,
            ),
        onMutate: ({ messageUuid, humanScore }) => {
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
