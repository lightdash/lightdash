import type {
    ApiAiMcpServerListResponse,
    ApiAiMcpServerResponse,
    ApiCreateAiMcpServer,
    ApiError,
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

const startProjectAiMcpOAuthConnection = async (
    projectUuid: string,
    mcpServerUuid: string,
): Promise<{ authorizationUrl: string }> =>
    lightdashApi<any>({
        version: 'v1',
        url: `/projects/${projectUuid}/aiAgents/mcpServers/${mcpServerUuid}/oauth/start`,
        method: 'POST',
        body: JSON.stringify({}),
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

export const useStartMcpOAuthConnectionMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastError, showToastSuccess } = useToaster();

    return useMutation<
        void,
        Error,
        { mcpServerUuid: string; popupWindow?: Window | null }
    >({
        mutationFn: async ({ mcpServerUuid, popupWindow }) => {
            const { authorizationUrl } = await startProjectAiMcpOAuthConnection(
                projectUuid,
                mcpServerUuid,
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
