import type { MCPClient } from '@ai-sdk/mcp';
import type { AiMcpServerConnectionStatus } from '@lightdash/common';
import type { ToolSet } from 'ai';
import Logger from '../../../logging/logger';
import {
    createHttpMcpClient,
    McpAuthorizationRequiredError,
} from './AiAgentMcpRuntimeClient';
import type { AiAgentMcpServer, UnavailableMcpServer } from './types/aiAgent';
import type { UpdateMcpServerRuntimeStateFn } from './types/aiAgentDependencies';
import { getUserFacingErrorMessage } from './utils/errorMessages';

const sanitizeMcpToolKeyPart = (value: string) => {
    const sanitized = value
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+/, '')
        .replace(/_+$/, '');
    return sanitized.length > 0 ? sanitized.toLowerCase() : 'tool';
};

const getUnavailableMcpStatus = (
    mcpServer: AiAgentMcpServer,
    error: Error,
): AiMcpServerConnectionStatus => {
    if (
        mcpServer.authType === 'bearer' &&
        (!mcpServer.resolvedCredential ||
            mcpServer.resolvedCredential.type !== 'bearer' ||
            !mcpServer.resolvedCredential.bearerToken)
    ) {
        return 'not_connected';
    }

    if (
        mcpServer.authType === 'oauth' &&
        error instanceof McpAuthorizationRequiredError
    ) {
        if (mcpServer.connectionStatus === 'connecting') {
            return 'connecting';
        }

        if (mcpServer.connectionStatus === 'not_connected') {
            return 'not_connected';
        }

        return 'error';
    }

    return 'error';
};

const persistMcpRuntimeState = async (
    updateMcpServerRuntimeState: UpdateMcpServerRuntimeStateFn,
    args: {
        serverUuid: string;
        connectionStatus: AiMcpServerConnectionStatus;
        error: string | null;
    },
) => {
    try {
        await updateMcpServerRuntimeState(args);
    } catch (error) {
        Logger.error(
            `[AiAgent][MCP][${args.serverUuid}] Failed to persist runtime state`,
            error,
        );
    }
};

type ResolveMcpToolsArgs = {
    mcpServers: AiAgentMcpServer[];
    initialToolNames: string[];
    updateMcpServerRuntimeState: UpdateMcpServerRuntimeStateFn;
    debugLoggingEnabled: boolean;
};

export type ResolvedMcpTools = {
    tools: ToolSet;
    unavailableMcpServers: UnavailableMcpServer[];
    closeMcpClients: () => Promise<void>;
};

export const resolveMcpTools = async ({
    mcpServers,
    initialToolNames,
    updateMcpServerRuntimeState,
    debugLoggingEnabled,
}: ResolveMcpToolsArgs): Promise<ResolvedMcpTools> => {
    const log = (message: string) => {
        if (debugLoggingEnabled) {
            Logger.debug(`[AiAgent][MCP Resolver] ${message}`);
        }
    };

    if (mcpServers.length === 0) {
        return {
            tools: {},
            unavailableMcpServers: [],
            closeMcpClients: async () => undefined,
        };
    }

    const connectedClients: MCPClient[] = [];
    const usedToolNames = new Set(initialToolNames);
    const resolvedTools: ToolSet = {};
    const unavailableMcpServers: UnavailableMcpServer[] = [];

    const serverResults = await Promise.all(
        mcpServers.map(async (mcpServer) => {
            let mcpClient: MCPClient | undefined;

            try {
                log(`Connecting to ${mcpServer.name} (${mcpServer.url})`);
                mcpClient = await createHttpMcpClient(mcpServer, (error) => {
                    Logger.error(
                        `[AiAgent][MCP][${mcpServer.name}] Uncaught MCP client error`,
                        error,
                    );
                });

                const tools = await mcpClient.tools();
                await persistMcpRuntimeState(updateMcpServerRuntimeState, {
                    serverUuid: mcpServer.uuid,
                    connectionStatus: 'connected',
                    error: null,
                });

                return {
                    mcpServer,
                    mcpClient,
                    tools,
                    unavailableMcpServer: null,
                };
            } catch (error) {
                const normalizedError =
                    error instanceof Error ? error : new Error(String(error));
                const userFacingErrorMessage = getUserFacingErrorMessage(
                    normalizedError,
                    'We could not connect to the MCP server. Check that it is available and try again.',
                );
                const status = getUnavailableMcpStatus(
                    mcpServer,
                    normalizedError,
                );

                await persistMcpRuntimeState(updateMcpServerRuntimeState, {
                    serverUuid: mcpServer.uuid,
                    connectionStatus: status,
                    error: userFacingErrorMessage,
                });

                if (mcpClient) {
                    await mcpClient.close().catch((closeError) => {
                        Logger.error(
                            `[AiAgent][MCP][${mcpServer.name}] Failed to close failed MCP client`,
                            closeError,
                        );
                    });
                }

                return {
                    mcpServer,
                    mcpClient: null,
                    tools: null,
                    unavailableMcpServer: {
                        serverUuid: mcpServer.uuid,
                        serverName: mcpServer.name,
                        message: userFacingErrorMessage,
                        status,
                    } satisfies UnavailableMcpServer,
                };
            }
        }),
    );

    for (const serverResult of serverResults) {
        if (serverResult.unavailableMcpServer) {
            unavailableMcpServers.push(serverResult.unavailableMcpServer);
        } else if (serverResult.mcpClient && serverResult.tools) {
            connectedClients.push(serverResult.mcpClient);

            const serverPrefix = sanitizeMcpToolKeyPart(
                serverResult.mcpServer.name,
            );

            for (const [toolName, toolDefinition] of Object.entries(
                serverResult.tools,
            )) {
                const toolSuffix = sanitizeMcpToolKeyPart(toolName);
                const baseToolName = `mcp_${serverPrefix}__${toolSuffix}`;
                let namespacedToolName = baseToolName;
                let collisionCount = 1;

                while (usedToolNames.has(namespacedToolName)) {
                    collisionCount += 1;
                    namespacedToolName = `${baseToolName}_${collisionCount}`;
                }

                usedToolNames.add(namespacedToolName);
                resolvedTools[namespacedToolName] =
                    toolDefinition as ToolSet[string];
            }
        }
    }

    return {
        tools: resolvedTools,
        unavailableMcpServers,
        closeMcpClients: async () => {
            const results = await Promise.allSettled(
                connectedClients.map((client) => client.close()),
            );

            for (const result of results) {
                if (result.status === 'rejected') {
                    Logger.error(
                        '[AiAgent][MCP] Failed to close MCP client',
                        result.reason,
                    );
                }
            }
        },
    };
};
