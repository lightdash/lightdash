import {
    createMCPClient,
    type ListToolsResult,
    type MCPClient,
} from '@ai-sdk/mcp';
import {
    assertUnreachable,
    type AiMcpCredentialScope,
    type AiMcpServerAuthType,
    type AiMcpServerConnectionStatus,
    type AiMcpServerToolInput,
} from '@lightdash/common';
/* eslint-disable import/extensions */
import {
    auth,
    UnauthorizedError,
    type OAuthClientProvider,
    type OAuthDiscoveryState,
} from '@modelcontextprotocol/sdk/client/auth.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {
    OAuthClientInformationMixed,
    OAuthClientMetadata,
    OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { ToolSet } from 'ai';
/* eslint-enable import/extensions */
import { LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import type {
    AiMcpCredential,
    AiMcpOAuthCredentialPayload,
    AiMcpServerWithSensitiveData,
} from '../../models/AiAgentModel';
import { AiAgentModel } from '../../models/AiAgentModel';
import type { AiAgentMcpServer, UnavailableMcpServer } from './types/aiAgent';

type Dependencies = {
    aiAgentModel: AiAgentModel;
    lightdashConfig: LightdashConfig;
};

export type ResolvedMcpTools = {
    tools: ToolSet;
    unavailableMcpServers: UnavailableMcpServer[];
    closeMcpClients: () => Promise<void>;
};

const buildDefaultClientMetadata = (
    redirectUrl: string,
): OAuthClientMetadata => ({
    client_name: 'Lightdash MCP',
    redirect_uris: [redirectUrl],
    logo_uri: undefined,
    tos_uri: undefined,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
});

const toSdkTokens = (
    payload: AiMcpOAuthCredentialPayload,
): OAuthTokens | undefined => {
    if (!payload.tokens?.accessToken) {
        return undefined;
    }

    return {
        access_token: payload.tokens.accessToken,
        refresh_token: payload.tokens.refreshToken,
        token_type: payload.tokens.tokenType,
        scope: payload.tokens.scope,
    };
};

const fromSdkTokens = (
    tokens: OAuthTokens,
    previous?: AiMcpOAuthCredentialPayload['tokens'],
): AiMcpOAuthCredentialPayload['tokens'] => ({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? previous?.refreshToken,
    expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : previous?.expiresAt,
    tokenType: tokens.token_type,
    scope: tokens.scope,
});

export class McpAuthorizationRequiredError extends Error {
    constructor(
        readonly mcpServerName: string,
        readonly mcpServerUuid: string,
        readonly credentialScope: AiMcpCredentialScope,
    ) {
        super(
            `MCP server "${mcpServerName}" requires authorization before this agent can use it.`,
        );
        this.name = 'McpAuthorizationRequiredError';
    }
}

class PersistentMcpOAuthClientProvider implements OAuthClientProvider {
    private readonly credentialScope: AiMcpCredentialScope;

    private readonly redirectTargetUrl: string;

    private readonly getCredential: () => Promise<AiMcpCredential | undefined>;

    private readonly saveCredential: (
        payload: AiMcpOAuthCredentialPayload,
    ) => Promise<void>;

    private readonly onAuthorizationUrl?: (url: URL) => void | Promise<void>;

    private readonly forceReauth: boolean;

    private readonly defaultClientMetadata: OAuthClientMetadata;

    constructor(args: {
        credentialScope: AiMcpCredentialScope;
        redirectUrl: string;
        getCredential: () => Promise<AiMcpCredential | undefined>;
        saveCredential: (payload: AiMcpOAuthCredentialPayload) => Promise<void>;
        onAuthorizationUrl?: (url: URL) => void | Promise<void>;
        forceReauth?: boolean;
        clientMetadata?: OAuthClientMetadata;
    }) {
        this.credentialScope = args.credentialScope;
        this.redirectTargetUrl = args.redirectUrl;
        this.getCredential = args.getCredential;
        this.saveCredential = args.saveCredential;
        this.onAuthorizationUrl = args.onAuthorizationUrl;
        this.forceReauth = args.forceReauth ?? false;
        this.defaultClientMetadata =
            args.clientMetadata ??
            buildDefaultClientMetadata(this.redirectTargetUrl);
    }

    get redirectUrl(): string {
        return this.redirectTargetUrl;
    }

    get clientMetadata(): OAuthClientMetadata {
        return this.defaultClientMetadata;
    }

    private async loadPayload(): Promise<AiMcpOAuthCredentialPayload> {
        const credential = await this.getCredential();
        const payload = credential?.credentials;

        if (payload?.type === 'oauth') {
            return {
                ...payload,
                credentialScope: credential!.credentialScope,
            };
        }

        return {
            type: 'oauth',
            credentialScope: this.credentialScope,
            connectionStatus: 'not_connected',
            clientMetadata: this.defaultClientMetadata,
        };
    }

    private async persist(payload: AiMcpOAuthCredentialPayload): Promise<void> {
        await this.saveCredential({
            ...payload,
            credentialScope: this.credentialScope,
        });
    }

    async state(): Promise<string> {
        const payload = await this.loadPayload();
        const state = crypto.randomUUID();
        await this.persist({
            ...payload,
            state,
            lastError: undefined,
        });
        return state;
    }

    async clientInformation(): Promise<
        OAuthClientInformationMixed | undefined
    > {
        const payload = await this.loadPayload();
        return payload.clientInformation as
            | OAuthClientInformationMixed
            | undefined;
    }

    async saveClientInformation(
        clientInformation: OAuthClientInformationMixed,
    ): Promise<void> {
        const payload = await this.loadPayload();
        await this.persist({
            ...payload,
            clientInformation: clientInformation as Record<string, unknown>,
        });
    }

    async tokens(): Promise<OAuthTokens | undefined> {
        if (this.forceReauth) {
            return undefined;
        }

        return toSdkTokens(await this.loadPayload());
    }

    async saveTokens(tokens: OAuthTokens): Promise<void> {
        const payload = await this.loadPayload();
        await this.persist({
            ...payload,
            tokens: fromSdkTokens(tokens, payload.tokens),
            codeVerifier: undefined,
            state: undefined,
            connectionStatus: 'connected',
            lastError: undefined,
        });
    }

    async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
        const payload = await this.loadPayload();
        await this.persist({
            ...payload,
            connectionStatus: 'connecting',
            lastError: undefined,
        });

        await this.onAuthorizationUrl?.(authorizationUrl);
    }

    async saveCodeVerifier(codeVerifier: string): Promise<void> {
        const payload = await this.loadPayload();
        await this.persist({
            ...payload,
            codeVerifier,
            connectionStatus: 'connecting',
            lastError: undefined,
        });
    }

    async codeVerifier(): Promise<string> {
        const payload = await this.loadPayload();
        if (!payload.codeVerifier) {
            throw new Error('Missing OAuth code verifier');
        }
        return payload.codeVerifier;
    }

    async invalidateCredentials(
        scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery',
    ): Promise<void> {
        const payload = await this.loadPayload();
        const nextPayload: AiMcpOAuthCredentialPayload = { ...payload };

        if (scope === 'all' || scope === 'client') {
            nextPayload.clientInformation = undefined;
        }
        if (scope === 'all' || scope === 'tokens') {
            nextPayload.tokens = undefined;
        }
        if (scope === 'all' || scope === 'verifier') {
            nextPayload.codeVerifier = undefined;
            nextPayload.state = undefined;
        }
        if (scope === 'all' || scope === 'discovery') {
            nextPayload.resourceMetadata = undefined;
            nextPayload.resourceMetadataUrl = undefined;
            nextPayload.authorizationServerMetadata = undefined;
        }

        await this.persist({
            ...nextPayload,
            connectionStatus: 'error',
            lastError: 'OAuth credentials must be reconnected.',
        });
    }

    async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
        const payload = await this.loadPayload();
        await this.persist({
            ...payload,
            authorizationServerUrl: state.authorizationServerUrl,
            resourceMetadataUrl: state.resourceMetadataUrl,
            resourceMetadata: (state.resourceMetadata ?? undefined) as
                | Record<string, unknown>
                | undefined,
            authorizationServerMetadata: (state.authorizationServerMetadata ??
                undefined) as Record<string, unknown> | undefined,
        });
    }

    async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
        const payload = await this.loadPayload();
        if (
            (!payload.resourceMetadata &&
                !payload.authorizationServerMetadata) ||
            !payload.authorizationServerUrl
        ) {
            return undefined;
        }

        return {
            authorizationServerUrl: payload.authorizationServerUrl,
            resourceMetadataUrl: payload.resourceMetadataUrl,
            resourceMetadata: payload.resourceMetadata as
                | OAuthDiscoveryState['resourceMetadata']
                | undefined,
            authorizationServerMetadata: payload.authorizationServerMetadata as
                | OAuthDiscoveryState['authorizationServerMetadata']
                | undefined,
        };
    }
}

export const isMcpAuthorizationError = (error: unknown): boolean =>
    error instanceof UnauthorizedError ||
    (error instanceof Error &&
        (/401/.test(error.message) || /authorization/i.test(error.message)));

const sanitizeMcpToolKeyPart = (value: string) => {
    const sanitized = value
        .replace(/[^a-zA-Z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+/, '')
        .replace(/_+$/, '');
    return sanitized.length > 0 ? sanitized.toLowerCase() : 'tool';
};

type McpServerConnectionArgs = {
    uuid: string;
    name: string;
    url: string;
    authType: AiMcpServerAuthType;
    resolvedCredential: AiAgentMcpServer['resolvedCredential'];
    resolvedCredentialScope: AiAgentMcpServer['resolvedCredentialScope'];
    oauthProvider?: AiAgentMcpServer['oauthProvider'];
};

const getBearerToken = (mcpServer: McpServerConnectionArgs) => {
    if (
        mcpServer.authType === 'bearer' &&
        (!mcpServer.resolvedCredential ||
            mcpServer.resolvedCredential.type !== 'bearer' ||
            !mcpServer.resolvedCredential.bearerToken)
    ) {
        throw new Error(
            `MCP server "${mcpServer.name}" is missing bearer credentials`,
        );
    }

    switch (mcpServer.authType) {
        case 'none':
            return undefined;
        case 'bearer':
            return mcpServer.resolvedCredential?.type === 'bearer'
                ? mcpServer.resolvedCredential.bearerToken
                : undefined;
        case 'oauth':
            return undefined;
        default:
            return assertUnreachable(
                mcpServer.authType,
                `Unknown MCP auth type: ${mcpServer.authType}`,
            );
    }
};

const normalizeMcpError = (
    mcpServer: McpServerConnectionArgs,
    error: unknown,
): Error => {
    if (mcpServer.authType === 'oauth' && isMcpAuthorizationError(error)) {
        return new McpAuthorizationRequiredError(
            mcpServer.name,
            mcpServer.uuid,
            mcpServer.resolvedCredentialScope ?? 'shared',
        );
    }

    return error instanceof Error ? error : new Error(String(error));
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

        return 'not_connected';
    }

    return 'error';
};

const getMcpUserFacingErrorMessage = (error: Error): string => {
    if (error instanceof McpAuthorizationRequiredError) {
        return error.message;
    }

    if (error.message.includes('MCP HTTP Transport Error')) {
        if (
            error.message.includes('HTTP 401') ||
            error.message.includes('Unauthorized')
        ) {
            return 'The MCP server rejected the saved credentials. Check the MCP server authentication settings, then try again.';
        }

        if (
            error.message.includes('HTTP 403') ||
            error.message.includes('Forbidden')
        ) {
            return 'The MCP server refused access. Check that the connected account has permission to use this MCP server.';
        }
    }

    return 'We could not connect to the MCP server. Check that it is available and try again.';
};

export const createHttpMcpClient = async (
    mcpServer: McpServerConnectionArgs,
    onUncaughtError?: (error: unknown) => void,
): Promise<MCPClient> => {
    const bearerToken = getBearerToken(mcpServer);

    try {
        return await createMCPClient({
            transport:
                mcpServer.authType === 'oauth'
                    ? new StreamableHTTPClientTransport(
                          new URL(mcpServer.url),
                          {
                              authProvider: mcpServer.oauthProvider,
                              requestInit: {
                                  redirect: 'error',
                              },
                          },
                      )
                    : {
                          type: 'http',
                          url: mcpServer.url,
                          headers: bearerToken
                              ? {
                                    Authorization: `Bearer ${bearerToken}`,
                                }
                              : undefined,
                          redirect: 'error',
                      },
            onUncaughtError,
        });
    } catch (error) {
        throw normalizeMcpError(mcpServer, error);
    }
};

export const testMcpConnection = async (
    mcpServer: McpServerConnectionArgs,
    onUncaughtError?: (error: unknown) => void,
): Promise<void> => {
    const client = await createHttpMcpClient(mcpServer, onUncaughtError);

    try {
        await client.tools();
    } catch (error) {
        throw normalizeMcpError(mcpServer, error);
    } finally {
        await client.close();
    }
};

const toMcpServerToolInputs = (
    result: ListToolsResult,
): AiMcpServerToolInput[] =>
    result.tools.map((tool) => ({
        toolName: tool.name,
        title: tool.title ?? null,
        description: tool.description ?? null,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations ?? null,
        meta: tool._meta ?? null,
    }));

export class AiAgentMcpRuntimeClient {
    private readonly aiAgentModel: AiAgentModel;

    private readonly lightdashConfig: LightdashConfig;

    constructor(dependencies: Dependencies) {
        this.aiAgentModel = dependencies.aiAgentModel;
        this.lightdashConfig = dependencies.lightdashConfig;
    }

    private async persistRuntimeState(args: {
        serverUuid: string;
        connectionStatus: AiMcpServerConnectionStatus;
        error: string | null;
    }) {
        try {
            await this.aiAgentModel.updateMcpServerRuntimeState(args);
        } catch (error) {
            Logger.error(
                `[AiAgent][MCP][${args.serverUuid}] Failed to persist runtime state`,
                error,
            );
        }
    }

    private getMcpOAuthCallbackUrl(
        projectUuid: string,
        mcpServerUuid: string,
    ): string {
        return new URL(
            `/api/v1/projects/${projectUuid}/aiAgents/mcpServers/${mcpServerUuid}/oauth/callback`,
            this.lightdashConfig.siteUrl,
        ).toString();
    }

    private createSharedMcpOAuthProvider(args: {
        projectUuid: string;
        mcpServerUuid: string;
        actorUserUuid?: string;
        onAuthorizationUrl?: (url: URL) => void | Promise<void>;
        forceReauth?: boolean;
    }) {
        return new PersistentMcpOAuthClientProvider({
            credentialScope: 'shared',
            redirectUrl: this.getMcpOAuthCallbackUrl(
                args.projectUuid,
                args.mcpServerUuid,
            ),
            getCredential: () =>
                this.aiAgentModel.getCredential(args.mcpServerUuid, 'shared'),
            saveCredential: async (payload) => {
                await this.aiAgentModel.upsertCredential({
                    serverUuid: args.mcpServerUuid,
                    scope: 'shared',
                    credentials: payload,
                    actorUserUuid: args.actorUserUuid ?? null,
                });
            },
            onAuthorizationUrl: args.onAuthorizationUrl,
            forceReauth: args.forceReauth,
        });
    }

    // eslint-disable-next-line class-methods-use-this
    async testConnection(args: {
        name: string;
        url: string;
        authType: 'none' | 'bearer';
        bearerToken?: string;
        onUncaughtError?: (error: unknown) => void;
    }): Promise<void> {
        await testMcpConnection(
            {
                uuid: 'create-mcp-server-validation',
                name: args.name,
                url: args.url,
                authType: args.authType,
                resolvedCredential: args.bearerToken
                    ? {
                          type: 'bearer',
                          bearerToken: args.bearerToken,
                      }
                    : null,
                resolvedCredentialScope: args.bearerToken ? 'shared' : null,
            },
            args.onUncaughtError,
        );
    }

    async startOAuthConnection(args: {
        projectUuid: string;
        mcpServerUuid: string;
        serverUrl: string;
        actorUserUuid: string;
    }): Promise<string> {
        let authorizationUrl: URL | undefined;
        const provider = this.createSharedMcpOAuthProvider({
            projectUuid: args.projectUuid,
            mcpServerUuid: args.mcpServerUuid,
            actorUserUuid: args.actorUserUuid,
            forceReauth: true,
            onAuthorizationUrl: (url) => {
                authorizationUrl = url;
            },
        });

        await auth(provider, {
            serverUrl: args.serverUrl,
        });

        if (!authorizationUrl) {
            throw new Error('Could not start MCP OAuth authorization flow');
        }

        return authorizationUrl.toString();
    }

    async completeOAuthConnection(args: {
        projectUuid: string;
        mcpServerUuid: string;
        serverUrl: string;
        code: string;
        credential: AiMcpCredential;
    }): Promise<void> {
        const provider = this.createSharedMcpOAuthProvider({
            projectUuid: args.projectUuid,
            mcpServerUuid: args.mcpServerUuid,
            actorUserUuid:
                args.credential.updatedByUserUuid ??
                args.credential.createdByUserUuid ??
                undefined,
        });

        const transport = new StreamableHTTPClientTransport(
            new URL(args.serverUrl),
            {
                authProvider: provider,
                requestInit: {
                    redirect: 'error',
                },
            },
        );

        try {
            await transport.finishAuth(args.code);
        } catch (error) {
            await this.aiAgentModel.upsertCredential({
                serverUuid: args.mcpServerUuid,
                scope: 'shared',
                credentials: {
                    ...(args.credential
                        .credentials as AiMcpOAuthCredentialPayload),
                    connectionStatus: 'error',
                    lastError:
                        error instanceof Error ? error.message : String(error),
                },
                actorUserUuid:
                    args.credential.updatedByUserUuid ??
                    args.credential.createdByUserUuid ??
                    null,
            });
            throw error;
        } finally {
            await transport.close();
        }
    }

    async disconnectOAuthConnection(args: {
        mcpServerUuid: string;
        actorUserUuid: string;
    }): Promise<void> {
        await this.aiAgentModel.upsertCredential({
            serverUuid: args.mcpServerUuid,
            scope: 'shared',
            credentials: {
                type: 'oauth',
                credentialScope: 'shared',
                connectionStatus: 'not_connected',
            },
            actorUserUuid: args.actorUserUuid,
        });
    }

    attachRuntimeProviders(args: {
        projectUuid: string;
        userUuid: string;
        mcpServers: AiMcpServerWithSensitiveData[];
    }) {
        return args.mcpServers.map((mcpServer) => ({
            ...mcpServer,
            oauthProvider:
                mcpServer.authType === 'oauth'
                    ? this.createSharedMcpOAuthProvider({
                          projectUuid: args.projectUuid,
                          mcpServerUuid: mcpServer.uuid,
                          actorUserUuid: args.userUuid,
                      })
                    : undefined,
        }));
    }

    async listTools(args: {
        projectUuid: string;
        mcpServer: AiMcpServerWithSensitiveData;
    }): Promise<AiMcpServerToolInput[]> {
        let mcpClient: MCPClient | undefined;

        try {
            mcpClient = await createHttpMcpClient(
                {
                    ...args.mcpServer,
                    oauthProvider:
                        args.mcpServer.authType === 'oauth'
                            ? this.createSharedMcpOAuthProvider({
                                  projectUuid: args.projectUuid,
                                  mcpServerUuid: args.mcpServer.uuid,
                              })
                            : undefined,
                },
                (error) => {
                    Logger.error(
                        `[AiAgent][MCP][${args.mcpServer.name}] Uncaught MCP client error during tool discovery`,
                        error,
                    );
                },
            );

            const tools = await mcpClient.listTools();

            await this.persistRuntimeState({
                serverUuid: args.mcpServer.uuid,
                connectionStatus: 'connected',
                error: null,
            });

            return toMcpServerToolInputs(tools);
        } catch (error) {
            const normalizedError =
                error instanceof Error ? error : new Error(String(error));
            const userFacingErrorMessage =
                getMcpUserFacingErrorMessage(normalizedError);
            const status = getUnavailableMcpStatus(
                args.mcpServer as AiAgentMcpServer,
                normalizedError,
            );

            await this.persistRuntimeState({
                serverUuid: args.mcpServer.uuid,
                connectionStatus: status,
                error: userFacingErrorMessage,
            });

            throw normalizedError;
        } finally {
            if (mcpClient) {
                await mcpClient.close().catch((closeError) => {
                    Logger.error(
                        `[AiAgent][MCP][${args.mcpServer.name}] Failed to close MCP client after tool discovery`,
                        closeError,
                    );
                });
            }
        }
    }

    async resolveTools(args: {
        mcpServers: AiAgentMcpServer[];
        debugLoggingEnabled: boolean;
    }): Promise<ResolvedMcpTools> {
        const log = (message: string) => {
            if (args.debugLoggingEnabled) {
                Logger.debug(`[AiAgent][MCP Resolver] ${message}`);
            }
        };

        if (args.mcpServers.length === 0) {
            return {
                tools: {},
                unavailableMcpServers: [],
                closeMcpClients: async () => undefined,
            };
        }

        const connectedClients: MCPClient[] = [];
        const usedToolNames = new Set<string>();
        const resolvedTools: ToolSet = {};
        const unavailableMcpServers: UnavailableMcpServer[] = [];

        const serverResults = await Promise.all(
            args.mcpServers.map(async (mcpServer) => {
                let mcpClient: MCPClient | undefined;

                try {
                    log(`Connecting to ${mcpServer.name} (${mcpServer.url})`);
                    mcpClient = await createHttpMcpClient(
                        mcpServer,
                        (error) => {
                            Logger.error(
                                `[AiAgent][MCP][${mcpServer.name}] Uncaught MCP client error`,
                                error,
                            );
                        },
                    );

                    const tools = await mcpClient.tools();
                    await this.persistRuntimeState({
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
                        error instanceof Error
                            ? error
                            : new Error(String(error));
                    const userFacingErrorMessage =
                        getMcpUserFacingErrorMessage(normalizedError);
                    const status = getUnavailableMcpStatus(
                        mcpServer,
                        normalizedError,
                    );

                    await this.persistRuntimeState({
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
    }
}
