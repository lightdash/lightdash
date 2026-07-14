import {
    ApiKeyAccount,
    ForbiddenError,
    getErrorMessage,
    LightdashError,
    MissingConfigError,
    OauthAccount,
    ServiceAcctAccount,
    UserAttributeValueMap,
} from '@lightdash/common';
// eslint-disable-next-line import/extensions
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
// eslint-disable-next-line import/extensions
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import express, { type Router } from 'express';
import { IncomingMessage } from 'http';
import { validate as isValidUuid } from 'uuid';
import { allowApiKeyAuthentication } from '../controllers/authentication';
import { ExtraContext, McpService } from '../ee/services/McpService/McpService';
import Logger from '../logging/logger';
import { userAttributeOverridesSchema } from '../services/UserAttributesService/UserAttributeUtils';

const mcpRouter: Router = express.Router({ mergeParams: true });

function getMcpService(req: express.Request): McpService {
    try {
        return req.services.getMcpService();
    } catch (e) {
        throw new MissingConfigError('MCP service not available');
    }
}

const MCP_USER_ATTRIBUTE_HEADER = 'X-Lightdash-User-Attributes';
const MCP_PROJECT_HEADER = 'X-Lightdash-Project';

/**
 * Extracts a project UUID override from the X-Lightdash-Project header.
 * Project-level permissions are enforced downstream by the services invoked
 * by each MCP tool (e.g. ProjectService.getProject), so we only validate the
 * UUID shape here.
 */
function extractProjectUuidFromHeader(
    req: express.Request,
): string | undefined {
    const headerValue = req.headers[MCP_PROJECT_HEADER.toLowerCase()];
    if (!headerValue || typeof headerValue !== 'string') {
        return undefined;
    }
    if (!isValidUuid(headerValue)) {
        Logger.warn(`Invalid ${MCP_PROJECT_HEADER} header: not a UUID`);
        return undefined;
    }
    return headerValue;
}

/**
 * Extracts user attribute overrides from the X-Lightdash-User-Attributes header.
 * Header value should be a JSON object with string or string[] values.
 * Example: {"organizer_id": "123"} or {"organizer_id": ["123", "456"]}
 */
function extractUserAttributesFromHeader(
    req: express.Request,
): UserAttributeValueMap | undefined {
    const headerValue = req.headers[MCP_USER_ATTRIBUTE_HEADER.toLowerCase()];
    if (!headerValue || typeof headerValue !== 'string') {
        return undefined;
    }

    try {
        const parsed = JSON.parse(headerValue);
        const result = userAttributeOverridesSchema.safeParse(parsed);

        if (!result.success) {
            Logger.warn(
                `Invalid ${MCP_USER_ATTRIBUTE_HEADER} header: ${result.error.message}`,
            );
            return undefined;
        }

        return Object.keys(result.data).length > 0 ? result.data : undefined;
    } catch (e) {
        Logger.warn(
            `Failed to parse ${MCP_USER_ATTRIBUTE_HEADER} header: ${getErrorMessage(
                e,
            )}`,
        );
        return undefined;
    }
}

const MCP_PROTOCOL_VERSION_HEADER = 'MCP-Protocol-Version';

function extractProtocolVersionFromHeader(
    req: express.Request,
): string | undefined {
    const headerValue = req.headers[MCP_PROTOCOL_VERSION_HEADER.toLowerCase()];
    return typeof headerValue === 'string' ? headerValue : undefined;
}

/**
 * Only single-message bodies are inspected: an initialize inside a JSON-RPC
 * batch array is missed (batching was removed in protocol 2025-06-18, so this
 * only affects older clients).
 */
function isInitializeRequest(req: express.Request): boolean {
    const { body }: { body: unknown } = req;
    return (
        typeof body === 'object' &&
        body !== null &&
        'method' in body &&
        body.method === 'initialize'
    );
}

const MCP_SESSION_ID_HEADER = 'Mcp-Session-Id';

/**
 * The transport is stateless, so the session id is purely an analytics
 * correlation token: minted on initialize, echoed back by spec-compliant
 * clients on every subsequent request, never used as server-side state.
 * Only UUIDs (the shape we mint) are accepted back — anything else is
 * dropped rather than persisted.
 */
function extractSessionIdFromHeader(req: express.Request): string | undefined {
    const headerValue = req.headers[MCP_SESSION_ID_HEADER.toLowerCase()];
    if (typeof headerValue !== 'string' || !isValidUuid(headerValue)) {
        return undefined;
    }
    return headerValue;
}

/**
 * Reads the client identity from an MCP initialize request body
 * ({ method: 'initialize', params: { clientInfo: { name, version } } }).
 * Non-initialize requests never carry clientInfo (stateless transport).
 */
function extractClientInfoFromInitialize(
    req: express.Request,
): { name: string; version: string | null } | undefined {
    if (!isInitializeRequest(req)) {
        return undefined;
    }
    const { body } = req as { body: object };
    const params =
        'params' in body && typeof body.params === 'object'
            ? (body.params as { clientInfo?: unknown })
            : undefined;
    const clientInfo = params?.clientInfo;
    if (
        typeof clientInfo !== 'object' ||
        clientInfo === null ||
        !('name' in clientInfo) ||
        typeof clientInfo.name !== 'string' ||
        clientInfo.name.length === 0
    ) {
        return undefined;
    }
    const version =
        'version' in clientInfo && typeof clientInfo.version === 'string'
            ? clientInfo.version
            : null;
    return { name: clientInfo.name, version };
}

/*
MCP servers MUST use the HTTP header WWW-Authenticate when returning a 401 Unauthorized to indicate
the location of the resource server metadata URL as described in RFC9728 Section 5.1 "WWW-Authenticate Response".
https://www.rfc-editor.org/rfc/rfc9728#section-5.1
*/
const returnHeaderIfUnauthenticated = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
) => {
    if (req.account?.isAuthenticated()) {
        next();
    } else {
        const authHeaderPresent = !!req.headers.authorization;
        Logger.warn(
            `[MCP] Auth failed — header present: ${authHeaderPresent}, account: ${req.account?.authentication?.type ?? 'none'}`,
        );
        const oauthService = req.services.getOauthService();
        const baseUrl = oauthService.getSiteUrl();
        res.set(
            'WWW-Authenticate',
            `Bearer resource_metadata="${baseUrl}/api/v1/oauth/.well-known/oauth-protected-resource"`,
        );
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// MCP endpoint - supports Streamable HTTP
// Keep the MCP router as raw Express because:
// - MCP protocol requirements don't align with REST/TSOA patterns
// - We need full control over HTTP streaming and headers
// - It follows the same pattern as other protocol-specific endpoints (OAuth)
mcpRouter.all(
    '/',
    allowApiKeyAuthentication,
    returnHeaderIfUnauthenticated,
    async (req, res) => {
        try {
            const authType = req.account?.authentication?.type ?? 'none';
            const userEmail = req.user?.email ?? 'unknown';
            Logger.info(
                `[MCP] ${req.method} request — auth: ${authType}, user: ${userEmail}`,
            );

            const mcpService = getMcpService(req);

            // Check if MCP is enabled (either via config or AI Copilot flag)
            const isEnabled = await mcpService.isEnabled(req.user!);
            if (!isEnabled) {
                throw new ForbiddenError('MCP is not enabled');
            }

            if (req.method === 'GET') {
                // Handle SSE transport for MCP
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Cache-Control',
                });

                // Keep connection alive with periodic heartbeat
                const heartbeat = setInterval(() => {
                    res.write('event: heartbeat\ndata: {}\n\n');
                }, 30000);

                // Clean up on connection close
                req.on('close', () => {
                    clearInterval(heartbeat);
                });

                // Send initial connection event
                res.write('event: connect\ndata: {"type": "connect"}\n\n');
                return await Promise.resolve();
            }

            if (req.method === 'POST') {
                // SDK 1.26.0 requires a new server+transport per request in stateless mode
                // to prevent cross-client response data leaks (CVE-2026-25536)
                // See: https://github.com/advisories/GHSA-345p-7cg4-v4c7
                const headerProjectUuid = extractProjectUuidFromHeader(req);
                const userAgent = req.account?.requestContext?.userAgent;
                const protocolVersion = extractProtocolVersionFromHeader(req);

                // Session ids group tool calls made over one client
                // connection. Assigned on initialize (spec: clients MUST echo
                // the header on all subsequent requests); the stateless
                // transport skips session validation, so this stays a pure
                // correlation token with no server-side session state.
                const isInitialize = isInitializeRequest(req);
                const sessionId = isInitialize
                    ? randomUUID()
                    : extractSessionIdFromHeader(req);
                if (isInitialize && sessionId) {
                    res.setHeader(MCP_SESSION_ID_HEADER, sessionId);
                }

                // The transport is stateless, so clientInfo only ever appears
                // on initialize requests; store it so later tool calls can
                // attach the client identity by matching user agent.
                const clientInfo = extractClientInfoFromInitialize(req);
                if (clientInfo && userAgent && req.user) {
                    await mcpService.captureClientInfo({
                        user: req.user,
                        clientName: clientInfo.name,
                        clientVersion: clientInfo.version,
                        userAgent,
                    });
                }
                // Dark launch: the grep-based discovery tools are only
                // registered (and thus only listed/invocable) when the
                // AiGrepFields flag is enabled for this caller. Resolved here
                // because tool registration in setupHandlers is synchronous
                // (createServer only awaits to register skill resources
                // afterwards).
                // Content-write tools are only registered when the org-level
                // setting allows it, so admins can lock down MCP edits.
                // These lookups are independent, so resolve them together
                // rather than paying each round trip serially per request.
                const [grepFieldsEnabled, mcpContentWritesEnabled] =
                    await Promise.all([
                        mcpService.isAiGrepFieldsEnabled(req.user!),
                        mcpService.isMcpContentWritesEnabled(req.user!),
                    ]);
                const mcpServer = await mcpService.createServer({
                    projectPinned: headerProjectUuid !== undefined,
                    // The run_ai_writeback tool is always registered now that
                    // AI writeback has graduated from its dark-launch flag.
                    aiWritebackEnabled: true,
                    grepFieldsEnabled,
                    mcpContentWritesEnabled,
                });
                const transport = new StreamableHTTPServerTransport({
                    enableJsonResponse: true,
                    sessionIdGenerator: undefined,
                });
                await mcpServer.connect(transport);

                // Extract user attributes from header (for row-level security)
                const headerUserAttributes =
                    extractUserAttributesFromHeader(req);

                // Add auth info to request for the transport
                // The token details is loaded on the authentication middleware allowApiKeyAuthentication
                const authReq: IncomingMessage & {
                    auth?: AuthInfo;
                } = req;

                if (req.user && req.account?.isOauthUser()) {
                    const oauthAuth = req.account as OauthAccount;
                    const extra: ExtraContext = {
                        user: req.user,
                        account: oauthAuth,
                        headerUserAttributes,
                        headerProjectUuid,
                        userAgent,
                        protocolVersion,
                        sessionId,
                    };
                    authReq.auth = {
                        token: oauthAuth.authentication.token,
                        clientId: oauthAuth.authentication.clientId,
                        scopes: oauthAuth.authentication.scopes,
                        extra,
                    };
                }

                if (req.user && req.account?.isPatUser()) {
                    const apiKeyAuth = req.account as ApiKeyAccount;
                    const extra: ExtraContext = {
                        user: req.user,
                        account: apiKeyAuth,
                        headerUserAttributes,
                        headerProjectUuid,
                        userAgent,
                        protocolVersion,
                        sessionId,
                    };
                    authReq.auth = {
                        token: apiKeyAuth.authentication.source,
                        clientId: 'API key', // hardcoded client and scopes for PAT authentication
                        scopes: ['mcp:read', 'mcp:write'],
                        extra,
                    };
                }

                if (req.user && req.account?.isServiceAccount()) {
                    const serviceAccountAuth =
                        req.account as ServiceAcctAccount;
                    const extra: ExtraContext = {
                        user: req.user,
                        account: serviceAccountAuth,
                        headerUserAttributes,
                        headerProjectUuid,
                        userAgent,
                        protocolVersion,
                        sessionId,
                    };
                    authReq.auth = {
                        token: serviceAccountAuth.authentication.source,
                        clientId: 'Service account', // hardcoded client and scopes for Service Account authentication
                        scopes: ['mcp:read', 'mcp:write'],
                        extra,
                    };
                }

                return await transport.handleRequest(authReq, res, req.body);
            }

            res.status(405).json({ error: 'Method not allowed' });
            return await Promise.resolve();
        } catch (error) {
            Logger.error(`MCP endpoint error: ${getErrorMessage(error)}`);
            if (error instanceof LightdashError) {
                return res
                    .status(error.statusCode)
                    .json({ error: error.message });
            }

            return res.status(500).json({ error: 'Internal server error' });
        }
    },
);

export default mcpRouter;
