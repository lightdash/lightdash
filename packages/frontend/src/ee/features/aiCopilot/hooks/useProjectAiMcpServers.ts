import type {
    ApiAiMcpGithubAvailabilityResponse,
    ApiAiMcpGitlabAvailabilityResponse,
    ApiAiMcpOAuthCredentialRequest,
    ApiAiAgentMcpServerToolListResponse,
    ApiAiMcpServerListResponse,
    ApiAiMcpServerResponse,
    ApiConnectGithubMcpServerBody,
    ApiConnectGitlabMcpServerBody,
    ApiAiMcpServerToolListResponse,
    ApiCreateAiMcpServer,
    ApiError,
    ApiUpdateAiAgentMcpServerToolsRequest,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

export const PROJECT_AI_MCP_SERVERS_KEY = 'projectAiMcpServers';
export const AGENT_AI_MCP_SERVERS_KEY = 'agentAiMcpServers';
const PROJECT_AI_MCP_SERVER_TOOLS_KEY = 'projectAiMcpServerTools';
const AGENT_AI_MCP_SERVER_TOOLS_KEY = 'agentAiMcpServerTools';

const listProjectAiMcpServers = async (
    projectUuid: string,
): Promise<ApiAiMcpServerListResponse['results']> =>
    lightdashApi<ApiAiMcpServerListResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/mcpServers`,
        method: 'GET',
        body: undefined,
    });

const listAgentAiMcpServers = async (
    projectUuid: string,
    agentUuid: string,
): Promise<ApiAiMcpServerListResponse['results']> =>
    lightdashApi<ApiAiMcpServerListResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/mcpServers`,
        method: 'GET',
        body: undefined,
    });

const createProjectAiMcpServer = async (
    projectUuid: string,
    data: ApiCreateAiMcpServer,
): Promise<ApiAiMcpServerResponse['results']> =>
    lightdashApi<ApiAiMcpServerResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/mcpServers`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const getGithubMcpAvailability = async (
    projectUuid: string,
): Promise<ApiAiMcpGithubAvailabilityResponse['results']> =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lightdashApi<any>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/mcpServers/github/availability`,
        method: 'GET',
        body: undefined,
    });

const connectGithubMcpServer = async (
    projectUuid: string,
    body: ApiConnectGithubMcpServerBody,
): Promise<ApiAiMcpServerResponse['results']> =>
    lightdashApi<ApiAiMcpServerResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/mcpServers/github/connect`,
        method: 'POST',
        body: JSON.stringify(body),
    });

const getGitlabMcpAvailability = async (
    projectUuid: string,
): Promise<ApiAiMcpGitlabAvailabilityResponse['results']> =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lightdashApi<any>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/mcpServers/gitlab/availability`,
        method: 'GET',
        body: undefined,
    });

const connectGitlabMcpServer = async (
    projectUuid: string,
    body: ApiConnectGitlabMcpServerBody,
): Promise<ApiAiMcpServerResponse['results']> =>
    lightdashApi<ApiAiMcpServerResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/mcpServers/gitlab/connect`,
        method: 'POST',
        body: JSON.stringify(body),
    });

const listAgentAiMcpServerTools = async (
    projectUuid: string,
    agentUuid: string,
    mcpServerUuid: string,
): Promise<ApiAiAgentMcpServerToolListResponse['results']> =>
    lightdashApi<ApiAiAgentMcpServerToolListResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/mcpServers/${mcpServerUuid}/tools`,
        method: 'GET',
        body: undefined,
    });

const refreshProjectAiMcpServerTools = async (
    projectUuid: string,
    mcpServerUuid: string,
): Promise<ApiAiMcpServerToolListResponse['results']> =>
    lightdashApi<ApiAiMcpServerToolListResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/mcpServers/${mcpServerUuid}/tools/refresh`,
        method: 'POST',
        body: JSON.stringify({}),
    });

const updateAgentAiMcpServerTools = async (
    projectUuid: string,
    agentUuid: string,
    mcpServerUuid: string,
    data: ApiUpdateAiAgentMcpServerToolsRequest,
): Promise<ApiAiAgentMcpServerToolListResponse['results']> =>
    lightdashApi<ApiAiAgentMcpServerToolListResponse['results']>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/${agentUuid}/mcpServers/${mcpServerUuid}/tools`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

const startProjectAiMcpOAuthConnection = async (
    projectUuid: string,
    mcpServerUuid: string,
    data?: ApiAiMcpOAuthCredentialRequest,
): Promise<{ authorizationUrl: string }> =>
    lightdashApi<any>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/mcpServers/${mcpServerUuid}/oauth/start`,
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });

const disconnectProjectAiMcpOAuthConnection = async (
    projectUuid: string,
    mcpServerUuid: string,
    data?: ApiAiMcpOAuthCredentialRequest,
): Promise<void> =>
    lightdashApi<any>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/mcpServers/${mcpServerUuid}/oauth/disconnect`,
        method: 'POST',
        body: JSON.stringify(data ?? {}),
    });

const getProjectAiMcpServerConnectionStatus = async (
    projectUuid: string,
    mcpServerUuid: string,
) => {
    const mcpServers = await listProjectAiMcpServers(projectUuid);
    return (
        mcpServers.find((server) => server.uuid === mcpServerUuid)
            ?.connectionStatus ?? null
    );
};

const waitForProjectAiMcpServerConnection = async (
    projectUuid: string,
    mcpServerUuid: string,
    options?: {
        timeoutMs?: number;
        pollIntervalMs?: number;
    },
) => {
    const timeoutMs = options?.timeoutMs ?? 180_000;
    const pollIntervalMs = options?.pollIntervalMs ?? 1_000;
    return new Promise<'connected' | 'error' | 'timeout'>((resolve) => {
        let settled = false;

        const finish = (result: 'connected' | 'error' | 'timeout') => {
            if (settled) return;
            settled = true;
            window.clearInterval(intervalId);
            window.clearTimeout(timeoutId);
            resolve(result);
        };

        const poll = async () => {
            const connectionStatus =
                await getProjectAiMcpServerConnectionStatus(
                    projectUuid,
                    mcpServerUuid,
                );

            if (connectionStatus === 'connected') {
                finish('connected');
                return;
            }

            if (connectionStatus === 'error') {
                finish('error');
            }
        };

        const intervalId = window.setInterval(() => {
            void poll();
        }, pollIntervalMs);
        const timeoutId = window.setTimeout(() => {
            finish('timeout');
        }, timeoutMs);

        void poll();
    });
};

const openOAuthPopup = async ({
    authorizationUrl,
    projectUuid,
    mcpServerUuid,
    popupWindow,
}: {
    authorizationUrl: string;
    projectUuid: string;
    mcpServerUuid: string;
    popupWindow?: Window | null;
}) => {
    const oauthPopupWindow =
        popupWindow ??
        window.open('', 'mcp-oauth-popup', 'width=600,height=700');

    if (!oauthPopupWindow) {
        throw new Error('Failed to open popup window');
    }

    oauthPopupWindow.location.href = authorizationUrl;

    const result = await waitForProjectAiMcpServerConnection(
        projectUuid,
        mcpServerUuid,
    );

    if (result === 'connected') {
        return;
    }

    if (result === 'error') {
        throw new Error('Authentication failed');
    }

    throw new Error('Authentication timed out');
};

export const useProjectAiMcpServers = (
    projectUuid: string | undefined,
    options?: UseQueryOptions<ApiAiMcpServerListResponse['results'], ApiError>,
) => {
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiMcpServerListResponse['results'], ApiError>({
        queryKey: [PROJECT_AI_MCP_SERVERS_KEY, projectUuid],
        queryFn: () => listProjectAiMcpServers(projectUuid!),
        enabled: !!projectUuid && options?.enabled !== false,
        ...options,
        onError: (error) => {
            showToastApiError({
                title: 'Failed to fetch MCP servers',
                apiError: error.error,
            });
            options?.onError?.(error);
        },
    });
};

export const useAgentAiMcpServers = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
    options?: UseQueryOptions<ApiAiMcpServerListResponse['results'], ApiError>,
) => {
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiMcpServerListResponse['results'], ApiError>({
        queryKey: [AGENT_AI_MCP_SERVERS_KEY, projectUuid, agentUuid],
        queryFn: () => listAgentAiMcpServers(projectUuid!, agentUuid!),
        enabled: !!projectUuid && !!agentUuid && options?.enabled !== false,
        ...options,
        onError: (error) => {
            showToastApiError({
                title: 'Failed to fetch agent MCP servers',
                apiError: error.error,
            });
            options?.onError?.(error);
        },
    });
};

export const useAgentAiMcpServerTools = (
    projectUuid: string | undefined,
    agentUuid: string | undefined,
    mcpServerUuid: string | undefined,
    options?: UseQueryOptions<
        ApiAiAgentMcpServerToolListResponse['results'],
        ApiError
    >,
) => {
    const { showToastApiError } = useToaster();

    return useQuery<ApiAiAgentMcpServerToolListResponse['results'], ApiError>({
        queryKey: [
            AGENT_AI_MCP_SERVER_TOOLS_KEY,
            projectUuid,
            agentUuid,
            mcpServerUuid,
        ],
        queryFn: () =>
            listAgentAiMcpServerTools(projectUuid!, agentUuid!, mcpServerUuid!),
        enabled:
            !!projectUuid &&
            !!agentUuid &&
            !!mcpServerUuid &&
            options?.enabled !== false,
        ...options,
        onError: (error) => {
            showToastApiError({
                title: 'Failed to fetch MCP tools',
                apiError: error.error,
            });
            options?.onError?.(error);
        },
    });
};

export const useProjectCreateAiMcpServerMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiAiMcpServerResponse['results'],
        ApiError,
        ApiCreateAiMcpServer
    >({
        mutationFn: (data) => createProjectAiMcpServer(projectUuid, data),
        onSuccess: async (result) => {
            showToastSuccess({
                title: 'MCP server created successfully',
            });
            queryClient.setQueryData(
                [PROJECT_AI_MCP_SERVERS_KEY, projectUuid],
                (
                    currentData:
                        | ApiAiMcpServerListResponse['results']
                        | undefined,
                ) => {
                    if (!currentData) return currentData;
                    if (
                        currentData.some(
                            (server) => server.uuid === result.uuid,
                        )
                    )
                        return currentData;
                    return [...currentData, result];
                },
            );
            await queryClient.invalidateQueries({
                queryKey: [PROJECT_AI_MCP_SERVERS_KEY, projectUuid],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to create MCP server',
                apiError: error,
            });
        },
    });
};

const GITHUB_MCP_AVAILABILITY_KEY = 'githubMcpAvailability';

export const useGithubMcpAvailability = (
    projectUuid: string | undefined,
    options?: UseQueryOptions<
        ApiAiMcpGithubAvailabilityResponse['results'],
        ApiError
    >,
) =>
    useQuery<ApiAiMcpGithubAvailabilityResponse['results'], ApiError>({
        queryKey: [GITHUB_MCP_AVAILABILITY_KEY, projectUuid],
        queryFn: () => getGithubMcpAvailability(projectUuid!),
        enabled: !!projectUuid && options?.enabled !== false,
        ...options,
    });

export const useConnectGithubMcpServerMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiAiMcpServerResponse['results'],
        ApiError,
        ApiConnectGithubMcpServerBody
    >({
        mutationFn: (body) => connectGithubMcpServer(projectUuid, body),
        onSuccess: async (result) => {
            showToastSuccess({
                title: 'GitHub connected',
                subtitle: `${result.name} is ready to use with your agents.`,
            });
            await queryClient.invalidateQueries({
                queryKey: [PROJECT_AI_MCP_SERVERS_KEY, projectUuid],
            });
            await queryClient.invalidateQueries({
                queryKey: [GITHUB_MCP_AVAILABILITY_KEY, projectUuid],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to connect GitHub',
                apiError: error,
            });
        },
    });
};

const GITLAB_MCP_AVAILABILITY_KEY = 'gitlabMcpAvailability';

export const useGitlabMcpAvailability = (
    projectUuid: string | undefined,
    options?: UseQueryOptions<
        ApiAiMcpGitlabAvailabilityResponse['results'],
        ApiError
    >,
) =>
    useQuery<ApiAiMcpGitlabAvailabilityResponse['results'], ApiError>({
        queryKey: [GITLAB_MCP_AVAILABILITY_KEY, projectUuid],
        queryFn: () => getGitlabMcpAvailability(projectUuid!),
        enabled: !!projectUuid && options?.enabled !== false,
        ...options,
    });

export const useConnectGitlabMcpServerMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiAiMcpServerResponse['results'],
        ApiError,
        ApiConnectGitlabMcpServerBody
    >({
        mutationFn: (body) => connectGitlabMcpServer(projectUuid, body),
        onSuccess: async (result) => {
            showToastSuccess({
                title: 'GitLab connected',
                subtitle: `${result.name} is ready to use with your agents.`,
            });
            await queryClient.invalidateQueries({
                queryKey: [PROJECT_AI_MCP_SERVERS_KEY, projectUuid],
            });
            await queryClient.invalidateQueries({
                queryKey: [GITLAB_MCP_AVAILABILITY_KEY, projectUuid],
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to connect GitLab',
                apiError: error,
            });
        },
    });
};

export const useRefreshAiMcpServerToolsMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();

    return useMutation<
        ApiAiMcpServerToolListResponse['results'],
        ApiError,
        {
            mcpServerUuid: string;
            agentUuid?: string;
            showSuccessToast?: boolean;
        }
    >({
        mutationFn: ({ mcpServerUuid }) =>
            refreshProjectAiMcpServerTools(projectUuid, mcpServerUuid),
        onSuccess: async (_, variables) => {
            if (variables.showSuccessToast) {
                showToastSuccess({
                    title: 'MCP tools refreshed',
                });
            }

            await queryClient.invalidateQueries({
                queryKey: [
                    PROJECT_AI_MCP_SERVER_TOOLS_KEY,
                    projectUuid,
                    variables.mcpServerUuid,
                ],
            });

            if (variables.agentUuid) {
                await queryClient.invalidateQueries({
                    queryKey: [
                        AGENT_AI_MCP_SERVER_TOOLS_KEY,
                        projectUuid,
                        variables.agentUuid,
                        variables.mcpServerUuid,
                    ],
                });
            }
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to refresh MCP tools',
                apiError: error,
            });
        },
    });
};

export const useStartMcpOAuthConnectionMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastError, showToastSuccess } = useToaster();

    return useMutation<
        void,
        Error,
        {
            mcpServerUuid: string;
            credentialScope?: ApiAiMcpOAuthCredentialRequest['credentialScope'];
            popupWindow?: Window | null;
        }
    >({
        mutationFn: async ({ mcpServerUuid, credentialScope, popupWindow }) => {
            const { authorizationUrl } = await startProjectAiMcpOAuthConnection(
                projectUuid,
                mcpServerUuid,
                credentialScope ? { credentialScope } : undefined,
            );
            await openOAuthPopup({
                authorizationUrl,
                projectUuid,
                mcpServerUuid,
                popupWindow,
            });
        },
        onSuccess: async () => {
            showToastSuccess({
                title: 'MCP account connected successfully',
            });
            await queryClient.invalidateQueries({
                queryKey: [PROJECT_AI_MCP_SERVERS_KEY, projectUuid],
            });
            await queryClient.refetchQueries({
                queryKey: [PROJECT_AI_MCP_SERVERS_KEY, projectUuid],
                exact: true,
            });
        },
        onError: (error) => {
            showToastError({
                title: 'Authentication failed',
                subtitle: error.message || 'Please try again',
            });
        },
    });
};

export const useDisconnectMcpOAuthConnectionMutation = (
    projectUuid: string,
) => {
    const queryClient = useQueryClient();
    const { showToastError, showToastSuccess } = useToaster();

    return useMutation<
        void,
        Error,
        {
            mcpServerUuid: string;
            credentialScope?: ApiAiMcpOAuthCredentialRequest['credentialScope'];
        }
    >({
        mutationFn: async ({ mcpServerUuid, credentialScope }) => {
            await disconnectProjectAiMcpOAuthConnection(
                projectUuid,
                mcpServerUuid,
                credentialScope ? { credentialScope } : undefined,
            );
        },
        onSuccess: async () => {
            showToastSuccess({
                title: 'MCP account disconnected',
            });
            await queryClient.invalidateQueries({
                queryKey: [PROJECT_AI_MCP_SERVERS_KEY, projectUuid],
            });
            await queryClient.refetchQueries({
                queryKey: [PROJECT_AI_MCP_SERVERS_KEY, projectUuid],
                exact: true,
            });
        },
        onError: (error) => {
            showToastError({
                title: 'Failed to disconnect MCP account',
                subtitle: error.message || 'Please try again',
            });
        },
    });
};

export const useUpdateAgentAiMcpServerToolsMutation = (
    projectUuid: string,
    agentUuid: string,
    mcpServerUuid: string,
) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();

    return useMutation<
        ApiAiAgentMcpServerToolListResponse['results'],
        ApiError,
        ApiUpdateAiAgentMcpServerToolsRequest
    >(
        (data) =>
            updateAgentAiMcpServerTools(
                projectUuid,
                agentUuid,
                mcpServerUuid,
                data,
            ),
        {
            onMutate: async (
                data,
            ): Promise<{
                previousTools?: ApiAiAgentMcpServerToolListResponse['results'];
            }> => {
                const queryKey = [
                    AGENT_AI_MCP_SERVER_TOOLS_KEY,
                    projectUuid,
                    agentUuid,
                    mcpServerUuid,
                ];

                await queryClient.cancelQueries({ queryKey });

                const previousTools =
                    queryClient.getQueryData<
                        ApiAiAgentMcpServerToolListResponse['results']
                    >(queryKey);

                queryClient.setQueryData<
                    ApiAiAgentMcpServerToolListResponse['results']
                >(
                    queryKey,
                    (currentTools) =>
                        currentTools?.map((tool) => {
                            const nextSetting = data.toolSettings.find(
                                (setting) => setting.toolName === tool.toolName,
                            );

                            return nextSetting
                                ? { ...tool, enabled: nextSetting.enabled }
                                : tool;
                        }) ?? currentTools,
                );

                return { previousTools };
            },
            onSuccess: (tools) => {
                queryClient.setQueryData(
                    [
                        AGENT_AI_MCP_SERVER_TOOLS_KEY,
                        projectUuid,
                        agentUuid,
                        mcpServerUuid,
                    ],
                    tools,
                );
            },
            onError: ({ error }, _, context) => {
                queryClient.setQueryData(
                    [
                        AGENT_AI_MCP_SERVER_TOOLS_KEY,
                        projectUuid,
                        agentUuid,
                        mcpServerUuid,
                    ],
                    (
                        context as
                            | {
                                  previousTools?: ApiAiAgentMcpServerToolListResponse['results'];
                              }
                            | undefined
                    )?.previousTools,
                );
                showToastApiError({
                    title: 'Failed to update MCP tools',
                    apiError: error,
                });
            },
        },
    );
};
