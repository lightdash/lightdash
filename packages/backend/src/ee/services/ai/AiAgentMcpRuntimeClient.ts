import {
    createMCPClient,
    type Configuration,
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
    mcpToolNameToServerUuid: Record<string, string>;
    unavailableMcpServers: UnavailableMcpServer[];
    closeMcpClients: () => Promise<void>;
};

export type McpConnectionMetadata = {
    iconUrl: string | null;
};

type McpServerIcon = {
    src: string;
    mimeType?: string;
    sizes?: string[];
    theme?: 'light' | 'dark';
};

type McpServerInfoWithIcons = Configuration & {
    icons?: McpServerIcon[];
    websiteUrl?: string;
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

const resolveMcpIconUrl = (
    icon: McpServerIcon | undefined,
    serverUrl: string,
): string | null => {
    if (!icon?.src) {
        return null;
    }

    if (icon.src.startsWith('data:image/')) {
        return icon.src;
    }

    try {
        const iconUrl = new URL(icon.src, serverUrl);
        if (!['http:', 'https:'].includes(iconUrl.protocol)) {
            return null;
        }

        return iconUrl.toString();
    } catch {
        return null;
    }
};

const getMcpServerIconUrl = (
    serverInfo: Configuration,
    serverUrl: string,
): string | null => {
    const { icons, websiteUrl } = serverInfo as McpServerInfoWithIcons;

    if (icons?.length) {
        const preferredIcon =
            icons.find((icon) => icon.theme !== 'dark') ?? icons[0];
        return resolveMcpIconUrl(preferredIcon, serverUrl);
    }

    try {
        return new URL('/favicon.svg', websiteUrl ?? serverUrl).toString();
    } catch {
        return null;
    }
};

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

export class McpTimeoutError extends Error {
    constructor(
        timeoutMs: number,
        options?: { operation?: string; cause?: unknown },
    ) {
        super(
            `MCP ${options?.operation ?? 'request'} timed out after ${timeoutMs}ms`,
        );
        this.name = 'McpTimeoutError';
        if (options?.cause !== undefined) {
            this.cause = options.cause;
        }
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
            mcpServer.resolvedCredentialScope ?? 'user',
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

    if (error instanceof McpTimeoutError) {
        return 'The MCP server took too long to respond and was disconnected. Check that it is available, then try again.';
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

const isTimeoutAbortError = (error: unknown): boolean =>
    (error instanceof DOMException || error instanceof Error) &&
    error.name === 'TimeoutError';

// A fetch that aborts each request after `timeoutMs`, so a hanging MCP server
// tears down the underlying connection instead of leaking it.
const createMcpTimeoutFetch =
    (timeoutMs: number): typeof globalThis.fetch =>
    async (input, init) => {
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const signal = init?.signal
            ? AbortSignal.any([init.signal, timeoutSignal])
            : timeoutSignal;

        try {
            return await fetch(input, { ...init, signal });
        } catch (error) {
            if (isTimeoutAbortError(error)) {
                throw new McpTimeoutError(timeoutMs, { cause: error });
            }
            throw error;
        }
    };

export const createHttpMcpClient = async (
    mcpServer: McpServerConnectionArgs,
    timeoutMs: number,
    onUncaughtError?: (error: unknown) => void,
): Promise<MCPClient> => {
    const bearerToken = getBearerToken(mcpServer);
    const timeoutFetch = createMcpTimeoutFetch(timeoutMs);

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
                              fetch: timeoutFetch,
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
                          fetch: timeoutFetch,
                      },
            onUncaughtError,
        });
    } catch (error) {
        throw normalizeMcpError(mcpServer, error);
    }
};

const withMcpTimeout = <T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string,
    onLateResolve?: (value: T) => void,
): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            reject(new McpTimeoutError(timeoutMs, { operation }));
        }, timeoutMs);

        void promise.then(
            (value) => {
                clearTimeout(timer);
                if (timedOut) {
                    onLateResolve?.(value);
                } else {
                    resolve(value);
                }
            },
            (error) => {
                clearTimeout(timer);
                if (!timedOut) {
                    reject(error);
                }
            },
        );
    });

export const createHttpMcpClientWithTimeout = (
    mcpServer: McpServerConnectionArgs,
    timeoutMs: number,
    onUncaughtError?: (error: unknown) => void,
): Promise<MCPClient> =>
    withMcpTimeout(
        createHttpMcpClient(mcpServer, timeoutMs, onUncaughtError),
        timeoutMs,
        `connection to "${mcpServer.name}"`,
        (client) => {
            void client.close().catch((closeError) => {
                Logger.error(
                    `[AiAgent][MCP][${mcpServer.name}] Failed to close MCP client abandoned after connection timeout`,
                    closeError,
                );
            });
        },
    );

export const testMcpConnection = async (
    mcpServer: McpServerConnectionArgs,
    timeoutMs: number,
    onUncaughtError?: (error: unknown) => void,
): Promise<McpConnectionMetadata> => {
    const client = await createHttpMcpClientWithTimeout(
        mcpServer,
        timeoutMs,
        onUncaughtError,
    );

    try {
        await withMcpTimeout(
            client.tools(),
            timeoutMs,
            `tool discovery for "${mcpServer.name}"`,
        );
        return {
            iconUrl: getMcpServerIconUrl(client.serverInfo, mcpServer.url),
        };
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
        iconUrl?: string | null;
        credentialScope?: AiMcpCredentialScope | null;
        userUuid?: string;
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

    private createMcpOAuthProvider(args: {
        projectUuid: string;
        mcpServerUuid: string;
        credentialScope: AiMcpCredentialScope;
        userUuid?: string;
        actorUserUuid?: string;
        onAuthorizationUrl?: (url: URL) => void | Promise<void>;
        forceReauth?: boolean;
    }) {
        return new PersistentMcpOAuthClientProvider({
            credentialScope: args.credentialScope,
            redirectUrl: this.getMcpOAuthCallbackUrl(
                args.projectUuid,
                args.mcpServerUuid,
            ),
            getCredential: () =>
                this.aiAgentModel.getCredential(
                    args.mcpServerUuid,
                    args.credentialScope,
                    {
                        userUuid: args.userUuid,
                    },
                ),
            saveCredential: async (payload) => {
                await this.aiAgentModel.upsertCredential({
                    serverUuid: args.mcpServerUuid,
                    scope: args.credentialScope,
                    credentials: payload,
                    userUuid: args.userUuid,
                    actorUserUuid: args.actorUserUuid ?? null,
                });
            },
            onAuthorizationUrl: args.onAuthorizationUrl,
            forceReauth: args.forceReauth,
        });
    }

    private static getRuntimeOAuthCredentialScope(
        mcpServer: Pick<
            AiAgentMcpServer,
            'authType' | 'resolvedCredentialScope'
        >,
    ): AiMcpCredentialScope {
        if (mcpServer.authType !== 'oauth') {
            return 'shared';
        }

        return mcpServer.resolvedCredentialScope ?? 'user';
    }

    async testConnection(args: {
        name: string;
        url: string;
        authType: 'none' | 'bearer';
        bearerToken?: string;
        onUncaughtError?: (error: unknown) => void;
    }): Promise<McpConnectionMetadata> {
        return testMcpConnection(
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
            this.lightdashConfig.ai.copilot.mcpConnectionTimeoutMs,
            args.onUncaughtError,
        );
    }

    async startOAuthConnection(args: {
        projectUuid: string;
        mcpServerUuid: string;
        credentialScope: AiMcpCredentialScope;
        userUuid?: string;
        serverUrl: string;
        actorUserUuid: string;
    }): Promise<string> {
        let authorizationUrl: URL | undefined;
        const provider = this.createMcpOAuthProvider({
            projectUuid: args.projectUuid,
            mcpServerUuid: args.mcpServerUuid,
            credentialScope: args.credentialScope,
            userUuid: args.userUuid,
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
        const provider = this.createMcpOAuthProvider({
            projectUuid: args.projectUuid,
            mcpServerUuid: args.mcpServerUuid,
            credentialScope: args.credential.credentialScope,
            userUuid: args.credential.userUuid ?? undefined,
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
                scope: args.credential.credentialScope,
                credentials: {
                    ...(args.credential
                        .credentials as AiMcpOAuthCredentialPayload),
                    connectionStatus: 'error',
                    lastError:
                        error instanceof Error ? error.message : String(error),
                },
                userUuid: args.credential.userUuid,
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
        credentialScope: AiMcpCredentialScope;
        userUuid?: string;
        actorUserUuid: string;
    }): Promise<void> {
        await this.aiAgentModel.upsertCredential({
            serverUuid: args.mcpServerUuid,
            scope: args.credentialScope,
            credentials: {
                type: 'oauth',
                credentialScope: args.credentialScope,
                connectionStatus: 'not_connected',
            },
            userUuid: args.userUuid,
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
                    ? this.createMcpOAuthProvider({
                          projectUuid: args.projectUuid,
                          mcpServerUuid: mcpServer.uuid,
                          credentialScope:
                              AiAgentMcpRuntimeClient.getRuntimeOAuthCredentialScope(
                                  mcpServer,
                              ),
                          userUuid: args.userUuid,
                          actorUserUuid: args.userUuid,
                      })
                    : undefined,
        }));
    }

    async listTools(args: {
        projectUuid: string;
        userUuid?: string;
        mcpServer: AiMcpServerWithSensitiveData;
    }): Promise<AiMcpServerToolInput[]> {
        let mcpClient: MCPClient | undefined;

        try {
            mcpClient = await createHttpMcpClientWithTimeout(
                {
                    ...args.mcpServer,
                    oauthProvider:
                        args.mcpServer.authType === 'oauth'
                            ? this.createMcpOAuthProvider({
                                  projectUuid: args.projectUuid,
                                  mcpServerUuid: args.mcpServer.uuid,
                                  credentialScope:
                                      AiAgentMcpRuntimeClient.getRuntimeOAuthCredentialScope(
                                          args.mcpServer,
                                      ),
                                  userUuid: args.userUuid,
                              })
                            : undefined,
                },
                this.lightdashConfig.ai.copilot.mcpConnectionTimeoutMs,
                (error) => {
                    Logger.error(
                        `[AiAgent][MCP][${args.mcpServer.name}] Uncaught MCP client error during tool discovery`,
                        error,
                    );
                },
            );

            const tools = await withMcpTimeout(
                mcpClient.listTools(),
                this.lightdashConfig.ai.copilot.mcpConnectionTimeoutMs,
                `tool discovery for "${args.mcpServer.name}"`,
            );

            await this.persistRuntimeState({
                serverUuid: args.mcpServer.uuid,
                connectionStatus: 'connected',
                error: null,
                credentialScope: args.mcpServer.resolvedCredentialScope,
                userUuid:
                    args.mcpServer.resolvedCredentialScope === 'user'
                        ? args.userUuid
                        : undefined,
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
                credentialScope:
                    args.mcpServer.authType === 'oauth'
                        ? AiAgentMcpRuntimeClient.getRuntimeOAuthCredentialScope(
                              args.mcpServer,
                          )
                        : null,
                userUuid:
                    args.mcpServer.authType === 'oauth' &&
                    AiAgentMcpRuntimeClient.getRuntimeOAuthCredentialScope(
                        args.mcpServer,
                    ) === 'user'
                        ? args.userUuid
                        : undefined,
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
        userUuid: string;
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
                mcpToolNameToServerUuid: {},
                unavailableMcpServers: [],
                closeMcpClients: async () => undefined,
            };
        }

        const connectedClients: MCPClient[] = [];
        const usedToolNames = new Set<string>();
        const resolvedTools: ToolSet = {};
        const mcpToolNameToServerUuid: Record<string, string> = {};
        const unavailableMcpServers: UnavailableMcpServer[] = [];

        const serverResults = await Promise.all(
            args.mcpServers.map(async (mcpServer) => {
                let mcpClient: MCPClient | undefined;

                try {
                    log(`Connecting to ${mcpServer.name} (${mcpServer.url})`);
                    mcpClient = await createHttpMcpClientWithTimeout(
                        mcpServer,
                        this.lightdashConfig.ai.copilot.mcpConnectionTimeoutMs,
                        (error) => {
                            Logger.error(
                                `[AiAgent][MCP][${mcpServer.name}] Uncaught MCP client error`,
                                error,
                            );
                        },
                    );

                    const tools = await withMcpTimeout(
                        mcpClient.tools(),
                        this.lightdashConfig.ai.copilot.mcpConnectionTimeoutMs,
                        `tool discovery for "${mcpServer.name}"`,
                    );
                    await this.persistRuntimeState({
                        serverUuid: mcpServer.uuid,
                        connectionStatus: 'connected',
                        error: null,
                        iconUrl: getMcpServerIconUrl(
                            mcpClient.serverInfo,
                            mcpServer.url,
                        ),
                        credentialScope: mcpServer.resolvedCredentialScope,
                        userUuid:
                            mcpServer.resolvedCredentialScope === 'user'
                                ? args.userUuid
                                : undefined,
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
                        credentialScope:
                            mcpServer.authType === 'oauth'
                                ? AiAgentMcpRuntimeClient.getRuntimeOAuthCredentialScope(
                                      mcpServer,
                                  )
                                : null,
                        userUuid:
                            mcpServer.authType === 'oauth' &&
                            AiAgentMcpRuntimeClient.getRuntimeOAuthCredentialScope(
                                mcpServer,
                            ) === 'user'
                                ? args.userUuid
                                : undefined,
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
                const enabledToolNames = new Set(
                    serverResult.mcpServer.enabledToolNames ?? [],
                );

                for (const [toolName, toolDefinition] of Object.entries(
                    serverResult.tools,
                )) {
                    if (
                        serverResult.mcpServer.enabledToolNames &&
                        !enabledToolNames.has(toolName)
                    ) {
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    const toolSuffix = sanitizeMcpToolKeyPart(toolName);
                    const baseToolName = `mcp_${serverPrefix}__${toolSuffix}`;
                    let namespacedToolName = baseToolName;
                    let collisionCount = 1;

                    while (usedToolNames.has(namespacedToolName)) {
                        collisionCount += 1;
                        namespacedToolName = `${baseToolName}_${collisionCount}`;
                    }

                    usedToolNames.add(namespacedToolName);
                    mcpToolNameToServerUuid[namespacedToolName] =
                        serverResult.mcpServer.uuid;
                    resolvedTools[namespacedToolName] =
                        toolDefinition as ToolSet[string];
                }
            }
        }

        return {
            tools: resolvedTools,
            mcpToolNameToServerUuid,
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
