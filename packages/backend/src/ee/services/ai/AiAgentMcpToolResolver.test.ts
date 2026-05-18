import type { MCPClient } from '@ai-sdk/mcp';
import {
    createHttpMcpClient,
    McpAuthorizationRequiredError,
} from './AiAgentMcpRuntimeClient';
import { resolveMcpTools } from './AiAgentMcpToolResolver';
import type { AiAgentMcpServer } from './types/aiAgent';

jest.mock('./AiAgentMcpRuntimeClient', () => {
    const actual = jest.requireActual('./AiAgentMcpRuntimeClient');
    return {
        ...actual,
        createHttpMcpClient: jest.fn(),
    };
});

const mockedCreateHttpMcpClient = jest.mocked(createHttpMcpClient);

const getMcpServer = (
    overrides: Partial<AiAgentMcpServer>,
): AiAgentMcpServer => ({
    uuid: crypto.randomUUID(),
    projectUuid: 'project-uuid',
    name: 'Docs MCP',
    url: 'https://docs.example.com/mcp',
    authType: 'none',
    hasCredentials: false,
    credentialScope: null,
    connectionStatus: 'connected',
    error: null,
    connectedByUserUuid: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    resolvedCredential: null,
    resolvedCredentialScope: null,
    ...overrides,
});

describe('resolveMcpTools', () => {
    beforeEach(() => {
        mockedCreateHttpMcpClient.mockReset();
    });

    it('keeps healthy MCP tools when another MCP fails', async () => {
        const close = jest.fn().mockResolvedValue(undefined);
        const updateMcpServerRuntimeState = jest
            .fn()
            .mockResolvedValue(undefined);
        const healthyServer = getMcpServer({ name: 'Docs MCP' });
        const brokenServer = getMcpServer({
            uuid: 'broken-server',
            name: 'Broken MCP',
            url: 'https://broken.example.com/mcp',
        });

        mockedCreateHttpMcpClient.mockImplementation(
            async (mcpServer: Parameters<typeof createHttpMcpClient>[0]) => {
                if (mcpServer.uuid === brokenServer.uuid) {
                    throw new Error('Connection refused');
                }

                return {
                    tools: async () => ({
                        search: { description: 'search tool' },
                    }),
                    close,
                } as unknown as MCPClient;
            },
        );

        const result = await resolveMcpTools({
            mcpServers: [healthyServer, brokenServer],
            initialToolNames: ['mcp_docs_mcp__search'],
            updateMcpServerRuntimeState,
            debugLoggingEnabled: false,
        });

        expect(Object.keys(result.tools)).toEqual(['mcp_docs_mcp__search_2']);
        expect(result.unavailableMcpServers).toEqual([
            {
                serverUuid: 'broken-server',
                serverName: 'Broken MCP',
                message:
                    'We could not connect to the MCP server. Check that it is available and try again.',
                status: 'error',
            },
        ]);
        expect(updateMcpServerRuntimeState).toHaveBeenCalledWith({
            serverUuid: healthyServer.uuid,
            connectionStatus: 'connected',
            error: null,
        });
        expect(updateMcpServerRuntimeState).toHaveBeenCalledWith({
            serverUuid: 'broken-server',
            connectionStatus: 'error',
            error: 'We could not connect to the MCP server. Check that it is available and try again.',
        });

        await result.closeMcpClients();
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('preserves not_connected for authorization-required OAuth servers', async () => {
        const oauthServer = getMcpServer({
            uuid: 'oauth-server',
            name: 'OAuth MCP',
            authType: 'oauth',
            connectionStatus: 'not_connected',
        });
        const updateMcpServerRuntimeState = jest
            .fn()
            .mockResolvedValue(undefined);

        mockedCreateHttpMcpClient.mockRejectedValue(
            new McpAuthorizationRequiredError(
                oauthServer.name,
                oauthServer.uuid,
                'shared',
            ),
        );

        const result = await resolveMcpTools({
            mcpServers: [oauthServer],
            initialToolNames: [],
            updateMcpServerRuntimeState,
            debugLoggingEnabled: false,
        });

        expect(result.unavailableMcpServers).toEqual([
            {
                serverUuid: 'oauth-server',
                serverName: 'OAuth MCP',
                message:
                    'MCP server "OAuth MCP" requires authorization before this agent can use it.',
                status: 'not_connected',
            },
        ]);
        expect(updateMcpServerRuntimeState).toHaveBeenCalledWith({
            serverUuid: 'oauth-server',
            connectionStatus: 'not_connected',
            error: 'MCP server "OAuth MCP" requires authorization before this agent can use it.',
        });
    });
});
