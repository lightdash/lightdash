// eslint-disable-next-line import/extensions
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
// eslint-disable-next-line import/extensions
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { IncomingMessage } from 'http';

import {
    ApiKeyAccount,
    ForbiddenError,
    getErrorMessage,
    LightdashError,
    LightdashSessionUser,
    MissingConfigError,
    NotImplementedError,
    OauthAccount,
    OauthAuth,
} from '@lightdash/common';
import {
    allowApiKeyAuthentication,
    allowOauthAuthentication,
    isAuthenticated,
} from '../controllers/authentication';
import { ExtraContext, McpService } from '../ee/services/McpService/McpService';
import Logger from '../logging/logger';

const mcpRouter = express.Router({ mergeParams: true });

function getMcpService(req: express.Request): McpService {
    try {
        return req.services.getMcpService();
    } catch (e) {
        throw new MissingConfigError('MCP service not available');
    }
}

/*
MCP servers MUST use the HTTP header WWW-Authenticate when returning a 401 Unauthorized to indicate
the location of the resource server metadata URL as described in RFC9728 Section 5.1 “WWW-Authenticate Response”.
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
    allowOauthAuthentication,
    allowApiKeyAuthentication,
    returnHeaderIfUnauthenticated,
    async (req, res) => {
        try {
            const mcpService = getMcpService(req);

            // Check if MCP is enabled (either via config or AI Copilot flag)
            const isEnabled = await mcpService.isEnabled(req.user!);
            if (!isEnabled) {
                throw new ForbiddenError('MCP is not enabled');
            }

            const mcpServer = mcpService.getServer();

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
                // Handle Streamable HTTP transport
                const transport = new StreamableHTTPServerTransport({
                    enableJsonResponse: true,
                    sessionIdGenerator: undefined,
                });
                await mcpServer.connect(transport);

                // Add auth info to request for the transport
                // The token details is loaded on the authentication middleware allowOauthAuthentication
                const authReq: IncomingMessage & {
                    auth?: AuthInfo;
                } = req;

                if (req.user && req.account?.isOauthUser()) {
                    const oauthAuth = req.account as OauthAccount;
                    const extra: ExtraContext = {
                        user: req.user,
                        account: oauthAuth,
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
                    };
                    authReq.auth = {
                        token: apiKeyAuth.authentication.source,
                        clientId: 'API key', // hardcoded client and scopes for PAT authentication
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
