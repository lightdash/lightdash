import * as mcpSdk from '@ai-sdk/mcp';
import type { MCPClient } from '@ai-sdk/mcp';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { AiAgentModel } from '../../models/AiAgentModel';
import * as mcpRuntimeClientModule from './AiAgentMcpRuntimeClient';
import {
    AiAgentMcpRuntimeClient,
    createHttpMcpClient,
    McpAuthorizationRequiredError,
} from './AiAgentMcpRuntimeClient';
import type { AiAgentMcpServer } from './types/aiAgent';

jest.mock('@ai-sdk/mcp', () => ({
    ...jest.requireActual('@ai-sdk/mcp'),
    createMCPClient: jest.fn(),
}));

const getMcpServer = (
    overrides: Partial<AiAgentMcpServer>,
): AiAgentMcpServer => ({
    uuid: crypto.randomUUID(),
    projectUuid: 'project-uuid',
    name: 'Docs MCP',
    url: 'https://docs.example.com/mcp',
    iconUrl: null,
    authType: 'none',
    allowOAuthCredentialSharing: false,
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
    let createHttpMcpClientSpy: jest.SpiedFunction<typeof createHttpMcpClient>;
    const aiAgentModel = {
        updateMcpServerRuntimeState: jest.fn(),
    } as unknown as AiAgentModel;
    const runtimeClient = new AiAgentMcpRuntimeClient({
        aiAgentModel,
        lightdashConfig: {
            siteUrl: 'https://lightdash.example.com',
            mcp: {
                enabled: true,
                runSqlMaxLimit: 5000,
                timeoutMs: 20_000,
            },
        } as LightdashConfig,
    });

    beforeEach(() => {
        createHttpMcpClientSpy = jest.spyOn(
            mcpRuntimeClientModule,
            'createHttpMcpClient',
        );
        createHttpMcpClientSpy.mockReset();
        jest.mocked(aiAgentModel.updateMcpServerRuntimeState).mockReset();
    });

    afterEach(() => {
        createHttpMcpClientSpy.mockRestore();
    });

    it('keeps healthy MCP tools when another MCP fails', async () => {
        const close = jest.fn().mockResolvedValue(undefined);
        const healthyServer = getMcpServer({ name: 'Docs MCP' });
        const brokenServer = getMcpServer({
            uuid: 'broken-server',
            name: 'Broken MCP',
            url: 'https://broken.example.com/mcp',
        });

        createHttpMcpClientSpy.mockImplementation(
            async (mcpServer: Parameters<typeof createHttpMcpClient>[0]) => {
                if (mcpServer.uuid === brokenServer.uuid) {
                    throw new Error('Connection refused');
                }

                return {
                    serverInfo: {
                        name: 'Docs MCP',
                        version: '1.0.0',
                        icons: [
                            {
                                src: '/docs-icon.svg',
                            },
                        ],
                    },
                    tools: async () => ({
                        search: { description: 'search tool' },
                    }),
                    close,
                } as unknown as MCPClient;
            },
        );

        const result = await runtimeClient.resolveTools({
            mcpServers: [healthyServer, brokenServer],
            userUuid: 'user-uuid',
            debugLoggingEnabled: false,
        });

        expect(Object.keys(result.tools)).toEqual(['mcp_docs_mcp__search']);
        expect(result.mcpToolNameToServerUuid).toEqual({
            mcp_docs_mcp__search: healthyServer.uuid,
        });
        expect(result.unavailableMcpServers).toEqual([
            {
                serverUuid: 'broken-server',
                serverName: 'Broken MCP',
                message:
                    'We could not connect to the MCP server. Check that it is available and try again.',
                status: 'error',
            },
        ]);
        expect(aiAgentModel.updateMcpServerRuntimeState).toHaveBeenCalledWith({
            serverUuid: healthyServer.uuid,
            connectionStatus: 'connected',
            error: null,
            iconUrl: 'https://docs.example.com/docs-icon.svg',
            credentialScope: null,
            userUuid: undefined,
        });
        expect(aiAgentModel.updateMcpServerRuntimeState).toHaveBeenCalledWith({
            serverUuid: 'broken-server',
            connectionStatus: 'error',
            error: 'We could not connect to the MCP server. Check that it is available and try again.',
            credentialScope: null,
            userUuid: undefined,
        });

        await result.closeMcpClients();
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('rejects non-image data URI MCP icons', async () => {
        const close = jest.fn().mockResolvedValue(undefined);
        const mcpServer = getMcpServer({ name: 'Docs MCP' });

        createHttpMcpClientSpy.mockResolvedValue({
            serverInfo: {
                name: 'Docs MCP',
                version: '1.0.0',
                icons: [
                    {
                        src: 'data:text/html,<script>alert(1)</script>',
                    },
                ],
            },
            tools: async () => ({
                search: { description: 'search tool' },
            }),
            close,
        } as unknown as MCPClient);

        const result = await runtimeClient.resolveTools({
            mcpServers: [mcpServer],
            userUuid: 'user-uuid',
            debugLoggingEnabled: false,
        });

        expect(aiAgentModel.updateMcpServerRuntimeState).toHaveBeenCalledWith({
            serverUuid: mcpServer.uuid,
            connectionStatus: 'connected',
            error: null,
            iconUrl: null,
            credentialScope: null,
            userUuid: undefined,
        });

        await result.closeMcpClients();
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('filters out disabled MCP tools', async () => {
        const close = jest.fn().mockResolvedValue(undefined);
        const server = getMcpServer({
            name: 'Lightdash Docs',
            enabledToolNames: ['search_lightdash'],
        });

        createHttpMcpClientSpy.mockResolvedValue({
            serverInfo: {
                name: 'Lightdash Docs',
                version: '1.0.0',
            },
            tools: async () => ({
                search_lightdash: { description: 'search tool' },
                query_docs_filesystem_lightdash: {
                    description: 'query tool',
                },
            }),
            close,
        } as unknown as MCPClient);

        const result = await runtimeClient.resolveTools({
            mcpServers: [server],
            userUuid: 'user-uuid',
            debugLoggingEnabled: false,
        });

        expect(Object.keys(result.tools)).toEqual([
            'mcp_lightdash_docs__search_lightdash',
        ]);

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

        createHttpMcpClientSpy.mockRejectedValue(
            new McpAuthorizationRequiredError(
                oauthServer.name,
                oauthServer.uuid,
                'shared',
            ),
        );

        const result = await runtimeClient.resolveTools({
            mcpServers: [oauthServer],
            userUuid: 'user-uuid',
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
        expect(aiAgentModel.updateMcpServerRuntimeState).toHaveBeenCalledWith({
            serverUuid: 'oauth-server',
            connectionStatus: 'not_connected',
            error: 'MCP server "OAuth MCP" requires authorization before this agent can use it.',
            credentialScope: 'user',
            userUuid: 'user-uuid',
        });
    });

    it('marks first-time OAuth authorization failures as not_connected', async () => {
        const oauthServer = getMcpServer({
            uuid: 'oauth-server-first-time',
            name: 'OAuth MCP',
            authType: 'oauth',
            connectionStatus: null,
        });

        createHttpMcpClientSpy.mockRejectedValue(
            new McpAuthorizationRequiredError(
                oauthServer.name,
                oauthServer.uuid,
                'shared',
            ),
        );

        const result = await runtimeClient.resolveTools({
            mcpServers: [oauthServer],
            userUuid: 'user-uuid',
            debugLoggingEnabled: false,
        });

        expect(result.unavailableMcpServers).toEqual([
            {
                serverUuid: 'oauth-server-first-time',
                serverName: 'OAuth MCP',
                message:
                    'MCP server "OAuth MCP" requires authorization before this agent can use it.',
                status: 'not_connected',
            },
        ]);
        expect(aiAgentModel.updateMcpServerRuntimeState).toHaveBeenCalledWith({
            serverUuid: 'oauth-server-first-time',
            connectionStatus: 'not_connected',
            error: 'MCP server "OAuth MCP" requires authorization before this agent can use it.',
            credentialScope: 'user',
            userUuid: 'user-uuid',
        });
    });

    it('marks a server unavailable when the connection times out', async () => {
        const fastTimeoutClient = new AiAgentMcpRuntimeClient({
            aiAgentModel,
            lightdashConfig: {
                siteUrl: 'https://lightdash.example.com',
                mcp: { enabled: true, runSqlMaxLimit: 5000, timeoutMs: 20 },
            } as LightdashConfig,
        });
        const server = getMcpServer({ name: 'Slow MCP' });

        createHttpMcpClientSpy.mockImplementation(
            () =>
                new Promise<MCPClient>(() => {
                    // never resolves — simulates a hung MCP server
                }),
        );

        const result = await fastTimeoutClient.resolveTools({
            mcpServers: [server],
            userUuid: 'user-uuid',
            debugLoggingEnabled: false,
        });

        expect(result.tools).toEqual({});
        expect(result.unavailableMcpServers).toEqual([
            {
                serverUuid: server.uuid,
                serverName: 'Slow MCP',
                message:
                    'The MCP server took too long to respond and was disconnected. Check that it is available, then try again.',
                status: 'error',
            },
        ]);
    });

    it('closes a client that connects after the timeout (late-close)', async () => {
        const fastTimeoutClient = new AiAgentMcpRuntimeClient({
            aiAgentModel,
            lightdashConfig: {
                siteUrl: 'https://lightdash.example.com',
                mcp: { enabled: true, runSqlMaxLimit: 5000, timeoutMs: 20 },
            } as LightdashConfig,
        });
        const close = jest.fn().mockResolvedValue(undefined);
        const server = getMcpServer({ name: 'Slow MCP' });

        let resolveConnect: ((client: MCPClient) => void) | undefined;
        createHttpMcpClientSpy.mockImplementation(
            () =>
                new Promise<MCPClient>((resolve) => {
                    resolveConnect = resolve;
                }),
        );

        const result = await fastTimeoutClient.resolveTools({
            mcpServers: [server],
            userUuid: 'user-uuid',
            debugLoggingEnabled: false,
        });

        expect(result.unavailableMcpServers).toHaveLength(1);
        expect(close).not.toHaveBeenCalled();

        resolveConnect!({
            serverInfo: { name: 'Slow MCP', version: '1.0.0' },
            tools: async () => ({}),
            close,
        } as unknown as MCPClient);

        await new Promise((resolve) => {
            setImmediate(resolve);
        });

        expect(close).toHaveBeenCalledTimes(1);
    });
});

describe('createHttpMcpClient', () => {
    beforeEach(() => {
        jest.mocked(mcpSdk.createMCPClient).mockReset();
    });

    it('normalizes first-time OAuth authorization failures as authorization-required', async () => {
        jest.mocked(mcpSdk.createMCPClient).mockRejectedValue(
            new Error('MCP HTTP Transport Error: HTTP 401 Unauthorized'),
        );

        await expect(
            createHttpMcpClient({
                uuid: 'oauth-server',
                name: 'OAuth MCP',
                url: 'https://oauth.example.com/mcp',
                authType: 'oauth',
                resolvedCredential: null,
                resolvedCredentialScope: null,
            }),
        ).rejects.toEqual(
            new McpAuthorizationRequiredError(
                'OAuth MCP',
                'oauth-server',
                'user',
            ),
        );
    });
});
