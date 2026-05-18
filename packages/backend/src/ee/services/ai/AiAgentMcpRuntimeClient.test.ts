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
    let createHttpMcpClientSpy: jest.SpiedFunction<typeof createHttpMcpClient>;
    const aiAgentModel = {
        updateMcpServerRuntimeState: jest.fn(),
    } as unknown as AiAgentModel;
    const runtimeClient = new AiAgentMcpRuntimeClient({
        aiAgentModel,
        lightdashConfig: {
            siteUrl: 'https://lightdash.example.com',
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
                    tools: async () => ({
                        search: { description: 'search tool' },
                    }),
                    close,
                } as unknown as MCPClient;
            },
        );

        const result = await runtimeClient.resolveTools({
            mcpServers: [healthyServer, brokenServer],
            debugLoggingEnabled: false,
        });

        expect(Object.keys(result.tools)).toEqual(['mcp_docs_mcp__search']);
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
        });
        expect(aiAgentModel.updateMcpServerRuntimeState).toHaveBeenCalledWith({
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

        createHttpMcpClientSpy.mockRejectedValue(
            new McpAuthorizationRequiredError(
                oauthServer.name,
                oauthServer.uuid,
                'shared',
            ),
        );

        const result = await runtimeClient.resolveTools({
            mcpServers: [oauthServer],
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
        });
    });
});
