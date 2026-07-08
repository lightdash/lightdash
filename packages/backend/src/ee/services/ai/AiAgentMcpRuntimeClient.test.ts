import * as mcpSdk from '@ai-sdk/mcp';
import type { MCPClient } from '@ai-sdk/mcp';
import type { LightdashConfig } from '../../../config/parseConfig';
import type {
    AiAgentModel,
    AiMcpCredential,
    AiMcpOAuthCredentialPayload,
} from '../../models/AiAgentModel';
import {
    AiAgentMcpRuntimeClient,
    createHttpMcpClient,
    McpAuthorizationRequiredError,
    McpTimeoutError,
} from './AiAgentMcpRuntimeClient';
import type { AiAgentMcpServer } from './types/aiAgent';

vi.mock('@ai-sdk/mcp', async () => ({
    ...(await vi.importActual<typeof import('@ai-sdk/mcp')>('@ai-sdk/mcp')),
    createMCPClient: vi.fn(),
}));

const authMock = vi.hoisted(() => vi.fn());

vi.mock('@modelcontextprotocol/sdk/client/auth.js', () => ({
    auth: authMock,
    UnauthorizedError: class UnauthorizedError extends Error {},
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
    const aiAgentModel = {
        updateMcpServerRuntimeState: vi.fn(),
    } as unknown as AiAgentModel;
    const runtimeClient = new AiAgentMcpRuntimeClient({
        aiAgentModel,
        lightdashConfig: {
            siteUrl: 'https://lightdash.example.com',
            ai: {
                copilot: { mcpConnectionTimeoutMs: 20_000 },
            },
        } as LightdashConfig,
    });

    beforeEach(() => {
        vi.mocked(mcpSdk.createMCPClient).mockReset();
        vi.mocked(aiAgentModel.updateMcpServerRuntimeState).mockReset();
    });

    it('keeps healthy MCP tools when another MCP fails', async () => {
        const close = vi.fn().mockResolvedValue(undefined);
        const healthyServer = getMcpServer({ name: 'Docs MCP' });
        const brokenServer = getMcpServer({
            uuid: 'broken-server',
            name: 'Broken MCP',
            url: 'https://broken.example.com/mcp',
        });

        vi.mocked(mcpSdk.createMCPClient).mockImplementation(async (config) => {
            if (
                'url' in config.transport &&
                config.transport.url === brokenServer.url
            ) {
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
        });

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
        const close = vi.fn().mockResolvedValue(undefined);
        const mcpServer = getMcpServer({ name: 'Docs MCP' });

        vi.mocked(mcpSdk.createMCPClient).mockResolvedValue({
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
        const close = vi.fn().mockResolvedValue(undefined);
        const server = getMcpServer({
            name: 'Lightdash Docs',
            enabledToolNames: ['search_lightdash'],
        });

        vi.mocked(mcpSdk.createMCPClient).mockResolvedValue({
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

        vi.mocked(mcpSdk.createMCPClient).mockRejectedValue(
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

        vi.mocked(mcpSdk.createMCPClient).mockRejectedValue(
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
                ai: { copilot: { mcpConnectionTimeoutMs: 20 } },
            } as LightdashConfig,
        });
        const server = getMcpServer({ name: 'Slow MCP' });

        vi.mocked(mcpSdk.createMCPClient).mockImplementation(
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
                ai: { copilot: { mcpConnectionTimeoutMs: 20 } },
            } as LightdashConfig,
        });
        const close = vi.fn().mockResolvedValue(undefined);
        const server = getMcpServer({ name: 'Slow MCP' });

        let resolveConnect: ((client: MCPClient) => void) | undefined;
        vi.mocked(mcpSdk.createMCPClient).mockImplementation(
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
        vi.mocked(mcpSdk.createMCPClient).mockReset();
    });

    it('normalizes first-time OAuth authorization failures as authorization-required', async () => {
        vi.mocked(mcpSdk.createMCPClient).mockRejectedValue(
            new Error('MCP HTTP Transport Error: HTTP 401 Unauthorized'),
        );

        await expect(
            createHttpMcpClient(
                {
                    uuid: 'oauth-server',
                    name: 'OAuth MCP',
                    url: 'https://oauth.example.com/mcp',
                    authType: 'oauth',
                    resolvedCredential: null,
                    resolvedCredentialScope: null,
                },
                20_000,
            ),
        ).rejects.toEqual(
            new McpAuthorizationRequiredError(
                'OAuth MCP',
                'oauth-server',
                'user',
            ),
        );
    });

    it('wraps transport fetch so a hanging request times out as McpTimeoutError', async () => {
        let transportFetch: typeof globalThis.fetch | undefined;
        vi.mocked(mcpSdk.createMCPClient).mockImplementation(async (config) => {
            const { transport } = config;
            if ('fetch' in transport) {
                transportFetch = transport.fetch as typeof globalThis.fetch;
            }
            return {
                serverInfo: { name: 'Hang MCP', version: '1.0.0' },
                tools: async () => ({}),
                close: vi.fn().mockResolvedValue(undefined),
            } as unknown as MCPClient;
        });

        await createHttpMcpClient(
            {
                uuid: 'hang-server',
                name: 'Hang MCP',
                url: 'https://hang.example.com/mcp',
                authType: 'none',
                resolvedCredential: null,
                resolvedCredentialScope: null,
            },
            20,
        );

        expect(transportFetch).toBeDefined();

        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
            (_input, init) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener('abort', () => {
                        reject(init.signal?.reason);
                    });
                }),
        );

        try {
            await expect(
                transportFetch!('https://hang.example.com/mcp'),
            ).rejects.toBeInstanceOf(McpTimeoutError);
        } finally {
            fetchSpy.mockRestore();
        }
    });
});

const getOAuthCredential = (
    payload: AiMcpOAuthCredentialPayload,
    overrides: Partial<AiMcpCredential> = {},
): AiMcpCredential => ({
    uuid: 'credential-uuid',
    mcpServerUuid: 'mcp-server-uuid',
    credentialScope: payload.credentialScope,
    userUuid: payload.credentialScope === 'user' ? 'user-uuid' : null,
    createdByUserUuid: 'user-uuid',
    updatedByUserUuid: 'user-uuid',
    createdAt: new Date(),
    updatedAt: new Date(),
    credentials: payload,
    ...overrides,
});

const getOAuthRuntimeClient = (payload: AiMcpOAuthCredentialPayload) => {
    let storedPayload = payload;
    const aiAgentModel = {
        getCredential: vi.fn(async () => getOAuthCredential(storedPayload)),
        upsertCredential: vi.fn(async (args) => {
            storedPayload = args.credentials;
            return getOAuthCredential(storedPayload, {
                mcpServerUuid: args.serverUuid,
                credentialScope: args.scope,
                userUuid: args.userUuid ?? null,
                createdByUserUuid: args.actorUserUuid ?? null,
                updatedByUserUuid: args.actorUserUuid ?? null,
            });
        }),
    };

    return new AiAgentMcpRuntimeClient({
        aiAgentModel: aiAgentModel as unknown as AiAgentModel,
        lightdashConfig: {
            siteUrl: 'https://lightdash.example.com',
        } as LightdashConfig,
    });
};

describe('startOAuthConnection', () => {
    beforeEach(() => {
        authMock.mockReset();
        vi.unstubAllGlobals();
    });

    it('adds the initial access token to dynamic client registration requests', async () => {
        let registrationAuthorizationHeader: string | null = null;
        const fetchMock = vi.fn(async (input, init) => {
            const url = input instanceof Request ? input.url : input.toString();

            if (url === 'https://auth.example.com/.well-known/oauth') {
                return new Response(
                    JSON.stringify({
                        registration_endpoint:
                            'https://auth.example.com/dcr/register',
                    }),
                    {
                        headers: {
                            'content-type': 'application/json',
                        },
                    },
                );
            }

            if (url === 'https://auth.example.com/dcr/register') {
                registrationAuthorizationHeader = new Headers(
                    init?.headers,
                ).get('Authorization');
                return new Response(
                    JSON.stringify({
                        client_id: 'registered-client-id',
                    }),
                    {
                        headers: {
                            'content-type': 'application/json',
                        },
                    },
                );
            }

            return new Response('{}');
        });
        vi.stubGlobal('fetch', fetchMock);

        authMock.mockImplementation(async (provider, options) => {
            expect(options.fetchFn).toEqual(expect.any(Function));
            await options.fetchFn('https://auth.example.com/.well-known/oauth');
            await options.fetchFn('https://auth.example.com/dcr/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: '{}',
            });
            await provider.redirectToAuthorization(
                new URL('https://auth.example.com/authorize'),
            );
        });

        const runtimeClient = getOAuthRuntimeClient({
            type: 'oauth',
            credentialScope: 'shared',
            connectionStatus: 'not_connected',
            clientRegistration: {
                initialAccessToken: 'dcr-token',
            },
        });

        await expect(
            runtimeClient.startOAuthConnection({
                projectUuid: 'project-uuid',
                mcpServerUuid: 'mcp-server-uuid',
                credentialScope: 'shared',
                serverUrl: 'https://mcp.example.com',
                actorUserUuid: 'user-uuid',
            }),
        ).resolves.toBe('https://auth.example.com/authorize');

        expect(registrationAuthorizationHeader).toBe('Bearer dcr-token');
    });

    it('persists user dynamic client registrations back to shared setup', async () => {
        const credentials = new Map<string, AiMcpOAuthCredentialPayload>([
            [
                'shared:',
                {
                    type: 'oauth',
                    credentialScope: 'shared',
                    connectionStatus: 'not_connected',
                    clientRegistration: {
                        initialAccessToken: 'dcr-token',
                    },
                },
            ],
            [
                'user:user-uuid',
                {
                    type: 'oauth',
                    credentialScope: 'user',
                    connectionStatus: 'not_connected',
                    clientRegistration: {
                        initialAccessToken: 'dcr-token',
                    },
                },
            ],
        ]);
        const getKey = (scope: string, userUuid?: string | null) =>
            `${scope}:${scope === 'user' ? (userUuid ?? '') : ''}`;
        const aiAgentModel = {
            getCredential: vi.fn(async (_serverUuid, scope, options) => {
                const storedPayload = credentials.get(
                    getKey(scope, options?.userUuid),
                );

                return storedPayload
                    ? getOAuthCredential(storedPayload, {
                          credentialScope: scope,
                          userUuid:
                              scope === 'user'
                                  ? (options?.userUuid ?? null)
                                  : null,
                      })
                    : undefined;
            }),
            upsertCredential: vi.fn(async (args) => {
                credentials.set(
                    getKey(args.scope, args.userUuid),
                    args.credentials,
                );
                return getOAuthCredential(args.credentials, {
                    mcpServerUuid: args.serverUuid,
                    credentialScope: args.scope,
                    userUuid: args.userUuid ?? null,
                    createdByUserUuid: args.actorUserUuid ?? null,
                    updatedByUserUuid: args.actorUserUuid ?? null,
                });
            }),
        };
        const runtimeClient = new AiAgentMcpRuntimeClient({
            aiAgentModel: aiAgentModel as unknown as AiAgentModel,
            lightdashConfig: {
                siteUrl: 'https://lightdash.example.com',
            } as LightdashConfig,
        });

        authMock.mockImplementation(async (provider) => {
            await provider.saveClientInformation({
                client_id: 'registered-client-id',
                client_secret: 'registered-client-secret',
            });
            await provider.redirectToAuthorization(
                new URL('https://auth.example.com/authorize'),
            );
        });

        await expect(
            runtimeClient.startOAuthConnection({
                projectUuid: 'project-uuid',
                mcpServerUuid: 'mcp-server-uuid',
                credentialScope: 'user',
                userUuid: 'user-uuid',
                serverUrl: 'https://mcp.example.com',
                actorUserUuid: 'user-uuid',
            }),
        ).resolves.toBe('https://auth.example.com/authorize');

        expect(credentials.get('shared:')).toMatchObject({
            credentialScope: 'shared',
            connectionStatus: 'not_connected',
            clientInformation: {
                client_id: 'registered-client-id',
                client_secret: 'registered-client-secret',
            },
            clientRegistration: {
                initialAccessToken: 'dcr-token',
            },
        });
    });

    it('uses seeded client information without installing a DCR fetch hook', async () => {
        authMock.mockImplementation(async (provider, options) => {
            await expect(provider.clientInformation()).resolves.toMatchObject({
                client_id: 'client-id',
                client_secret: 'client-secret',
            });
            expect(options.fetchFn).toBeUndefined();
            await provider.redirectToAuthorization(
                new URL('https://auth.example.com/authorize'),
            );
        });

        const runtimeClient = getOAuthRuntimeClient({
            type: 'oauth',
            credentialScope: 'shared',
            connectionStatus: 'not_connected',
            clientInformation: {
                client_id: 'client-id',
                client_secret: 'client-secret',
            },
        });

        await expect(
            runtimeClient.startOAuthConnection({
                projectUuid: 'project-uuid',
                mcpServerUuid: 'mcp-server-uuid',
                credentialScope: 'shared',
                serverUrl: 'https://mcp.example.com',
                actorUserUuid: 'user-uuid',
            }),
        ).resolves.toBe('https://auth.example.com/authorize');
    });
});

describe('disconnectOAuthConnection', () => {
    it('preserves OAuth client setup while clearing connection state', async () => {
        const existingPayload: AiMcpOAuthCredentialPayload = {
            type: 'oauth',
            credentialScope: 'shared',
            connectionStatus: 'connected',
            tokens: {
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                tokenType: 'Bearer',
            },
            clientInformation: {
                client_id: 'static-client-id',
                client_secret: 'static-client-secret',
                token_endpoint_auth_method: 'client_secret_post',
            },
            clientMetadata: {
                redirect_uris: ['https://lightdash.example.com/callback'],
            },
            clientRegistration: {
                initialAccessToken: 'dcr-token',
            },
            codeVerifier: 'code-verifier',
            state: 'oauth-state',
        };
        const aiAgentModel = {
            getCredential: vi.fn(async () =>
                getOAuthCredential(existingPayload),
            ),
            upsertCredential: vi.fn(async (args) =>
                getOAuthCredential(args.credentials, {
                    mcpServerUuid: args.serverUuid,
                    credentialScope: args.scope,
                    userUuid: args.userUuid ?? null,
                    updatedByUserUuid: args.actorUserUuid ?? null,
                }),
            ),
        };
        const runtimeClient = new AiAgentMcpRuntimeClient({
            aiAgentModel: aiAgentModel as unknown as AiAgentModel,
            lightdashConfig: {
                siteUrl: 'https://lightdash.example.com',
            } as LightdashConfig,
        });

        await runtimeClient.disconnectOAuthConnection({
            mcpServerUuid: 'mcp-server-uuid',
            credentialScope: 'shared',
            actorUserUuid: 'user-uuid',
        });

        expect(aiAgentModel.upsertCredential).toHaveBeenCalledWith({
            serverUuid: 'mcp-server-uuid',
            scope: 'shared',
            credentials: {
                type: 'oauth',
                credentialScope: 'shared',
                connectionStatus: 'not_connected',
                clientInformation: existingPayload.clientInformation,
                clientMetadata: existingPayload.clientMetadata,
                clientRegistration: existingPayload.clientRegistration,
            },
            userUuid: undefined,
            actorUserUuid: 'user-uuid',
        });
    });
});
