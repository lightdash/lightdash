/* eslint-disable @typescript-eslint/naming-convention */
import {
    generateOAuthAuthorizePage,
    generateOAuthRedirectPage,
    getClientName,
    getErrorMessage,
    OAuthIntrospectResponse,
    parseScopeString,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import express, { type Router } from 'express';
import Logger from '../logging/logger';
import { DEFAULT_OAUTH_CLIENT_ID } from '../models/OAuth2Model';
import {
    OAuthScope,
    OAuthService,
} from '../services/OAuthService/OAuthService';

const oauthRouter: Router = express.Router({ mergeParams: true });

// Get OAuth service from request
function getOAuthService(req: express.Request): OAuthService {
    return req.services.getOauthService();
}

// Get authorization - use OAuth2Server
oauthRouter.get('/authorize', async (req, res, next) => {
    if (!req.user) {
        const loginUrl = `/login?redirect=${encodeURIComponent(
            req.originalUrl || req.url,
        )}`;
        return res.redirect(loginUrl);
    }
    const {
        client_id,
        redirect_uri,
        scope,
        state,
        code_challenge,
        code_challenge_method,
    } = req.query;
    if (!client_id || !redirect_uri) {
        return res.status(400).send('Missing required parameters');
    }

    // Render authorize page using Handlebars template
    const scopeString = (scope as string) || '';
    res.set('Content-Type', 'text/html');
    return res.send(
        generateOAuthAuthorizePage({
            action: '/api/v1/oauth/authorize',
            client_id: client_id as string,
            client_name: getClientName(client_id as string),
            scope: scopeString,
            scopes: parseScopeString(scopeString),
            user: {
                firstName: req.user.firstName,
                lastName: req.user.lastName,
                organizationName: req.user.organizationName!,
            },
            hiddenInputs: [
                {
                    name: 'response_type',
                    value: (req.query.response_type ||
                        req.body.response_type ||
                        'code') as string,
                },
                {
                    name: 'client_id',
                    value: client_id as string,
                },
                {
                    name: 'redirect_uri',
                    value: redirect_uri as string,
                },
                {
                    name: 'scope',
                    value: scopeString,
                },
                {
                    name: 'state',
                    value: (state || '') as string,
                },
                {
                    name: 'code_challenge',
                    value: (code_challenge || '') as string,
                },
                {
                    name: 'code_challenge_method',
                    value: (code_challenge_method || '') as string,
                },
            ],
        }),
    );
});

oauthRouter.post('/authorize', async (req, res) => {
    if (req.body.approve === 'false') {
        // Denied
        res.set('Content-Type', 'text/html');
        const redirectUri = req.body.redirect_uri;
        if (!redirectUri) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Missing redirect_uri',
            });
        }
        const url = new URL(redirectUri);
        url.searchParams.set('error', 'access_denied');
        if (req.body.state) {
            url.searchParams.set('state', req.body.state);
        }
        return res.send(
            generateOAuthRedirectPage({
                redirectUrl: url.toString(),
                message:
                    'Access denied. Redirecting you back to your application...',
            }),
        );
    }
    if (!req.user) {
        return res.status(401).send('Unauthorized');
    }
    if (!req.user.userId || !req.user.organizationUuid) {
        return res.status(400).send('Missing userUuid or organizationUuid');
    }

    // Normalize scope parameter directly on the request object
    if (req.body.scope && Array.isArray(req.body.scope)) {
        req.body.scope = req.body.scope.join(' ');
    }
    if (req.query.scope && Array.isArray(req.query.scope)) {
        req.query.scope = req.query.scope.join(' ');
    }

    const oauthService = getOAuthService(req);
    const oauthReq = new OAuth2Server.Request(req);
    const oauthRes = new OAuth2Server.Response(res);
    try {
        const authorizationCode = await oauthService.authorize(
            oauthReq,
            oauthRes,
            {
                userId: req.user.userId,
                organizationUuid: req.user.organizationUuid,
            },
        );
        const redirectUri = req.body.redirect_uri;
        if (!redirectUri) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Missing redirect_uri',
            });
        }
        const url = new URL(redirectUri);
        url.searchParams.set('code', authorizationCode.authorizationCode);
        if (req.body.state) {
            url.searchParams.set('state', req.body.state);
        }

        res.set('Content-Type', 'text/html');
        return res.send(
            generateOAuthRedirectPage({
                redirectUrl: url.toString(),
                message: 'Redirecting you back to your application...',
            }),
        );
    } catch (error) {
        Logger.error(`Authorization error: ${error}`);
        const redirectUrl = new URL(req.body.redirect_uri);
        redirectUrl.searchParams.set('error', 'server_error');
        if (req.body.state)
            redirectUrl.searchParams.set('state', req.body.state);
        res.set('Content-Type', 'text/html');
        return res.send(
            generateOAuthRedirectPage({
                redirectUrl: redirectUrl.toString(),
                message:
                    'An error occurred. Redirecting you back to your application...',
            }),
        );
    }
});

// Post token - use OAuth2Server
oauthRouter.post('/token', async (req, res, next) => {
    const oauthService = getOAuthService(req);

    const oauthReq = new OAuth2Server.Request(req);
    const oauthRes = new OAuth2Server.Response(res);

    try {
        const token = await oauthService.token(oauthReq, oauthRes);
        res.json({
            access_token: token.accessToken,
            token_type: 'Bearer',
            expires_in: token.accessTokenExpiresAt
                ? Math.floor(
                      (token.accessTokenExpiresAt.getTime() - Date.now()) /
                          1000,
                  )
                : undefined,
            refresh_token: token.refreshToken,
            scope: Array.isArray(token.scope)
                ? token.scope.join(' ')
                : token.scope,
        });
    } catch (error) {
        Logger.error(`Token endpoint error: ${error}`);
        const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

        // Return 401 for authentication errors, 400 for other errors
        const statusCode =
            errorMessage.includes('Invalid') ||
            errorMessage.includes('required')
                ? 401
                : 400;
        res.status(statusCode).json({ error: errorMessage });
    }
});

// Token introspection endpoint
oauthRouter.post('/introspect', async (req, res) => {
    const { token } = req.body;

    if (!req.user) {
        return res.status(401).json({ error: 'invalid_request' });
    }
    if (!token) {
        return res.status(400).json({ error: 'invalid_request' });
    }

    try {
        const oauthService = getOAuthService(req);
        const oauthReq = new OAuth2Server.Request(req);
        const oauthRes = new OAuth2Server.Response(res);

        // Try to authenticate the token
        const tokenData = await oauthService.authenticate(oauthReq, oauthRes);
        if (tokenData && tokenData.accessTokenExpiresAt) {
            const introspectResponse: OAuthIntrospectResponse = {
                active: true,
                scope: Array.isArray(tokenData.scope)
                    ? tokenData.scope.join(' ')
                    : tokenData.scope,
                token_type: 'access_token',
                exp: Math.floor(
                    tokenData.accessTokenExpiresAt.getTime() / 1000, // Token expires timestamp
                ),
                iat: Math.floor(
                    tokenData.accessTokenExpiresAt.getTime() / 1000 - 3600, // issued at: token cretaed timestamp
                ),
                sub: tokenData.user.userUuid, // subject: Unique user identifier
                aud: tokenData.client.id, // audience: Client identifier
                iss: 'lightdash', // issuer
                jti: tokenData.accessToken, // JWT ID: Unique token identifier
                client_id: DEFAULT_OAUTH_CLIENT_ID,
                username: tokenData.user.userUuid,
            };
            return res.json(introspectResponse);
        }

        return res.json({ active: false });
    } catch (error) {
        Logger.error(`Introspection error: ${error}`);
        return res.json({ active: false });
    }
});

// Token revocation endpoint
oauthRouter.post('/revoke', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'invalid_request' });
    }

    try {
        const oauthService = getOAuthService(req);
        await oauthService.revokeToken(token);
    } catch (error) {
        Logger.error(`Revocation error: ${error}`);
    }
    return res.status(200).send();
});

// Dynamic Client Registration endpoint (RFC 7591)
// This endpoint is used to register a new OAuth client
// to be used with the MCP server
// Scopes and grant types are hardcoded for now
oauthRouter.post('/register', async (req, res) => {
    try {
        const { client_name, redirect_uris, scope, grantTypes } = req.body;

        Logger.info(
            `Registering Oauth client ${client_name} with redirect_uris ${redirect_uris} and scopes ${scope}`,
        );

        // Validate required fields
        if (!client_name || !redirect_uris || !Array.isArray(redirect_uris)) {
            return res.status(400).json({
                error: 'invalid_client_metadata',
                error_description: 'client_name and redirect_uris are required',
            });
        }

        const scopes = typeof scope === 'string' ? scope.split(' ') : [];
        /*
        // Do not enforce client scopes for now until more MCP clients support this
        const invalidScopes = scopes.filter((sc) => !sc.startsWith('mcp:'));
        if (invalidScopes.length > 0 || scopes.length === 0) {
            return res.status(400).json({
                error: 'invalid_scope',
                error_description: `Only scopes starting with 'mcp:' are allowed. Invalid scopes: ${invalidScopes.join(
                    ', ',
                )}`,
            });
        }
        */

        const client = await getOAuthService(req).registerClient({
            clientName: client_name,
            redirectUris: redirect_uris,
            grantTypes,
            scopes,
        });

        return res.status(201).json({
            client_id: client.clientId,
            client_secret: client.clientSecret,
            client_name: client.clientName,
            redirect_uris: client.redirectUris,
            grant_types: client.grantTypes,
            scope: client.scopes.join(' '),
            client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
        });
    } catch (error) {
        Logger.error(`Client registration error: ${getErrorMessage(error)}`);
        return res.status(500).json({
            error: 'server_error',
            error_description:
                'Internal server error during client registration',
        });
    }
});

// OAuth2 Discovery endpoint
// This endpoint should only be used for the MCP server to discover the OAuth2 server
// To create new clients
// We limit the scopes to MCP_READ and MCP_WRITE for now
export function oauthConfig(baseUrl: string) {
    return {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/api/v1/oauth/authorize`,
        token_endpoint: `${baseUrl}/api/v1/oauth/token`,
        introspection_endpoint: `${baseUrl}/api/v1/oauth/introspect`,
        revocation_endpoint: `${baseUrl}/api/v1/oauth/revoke`,
        registration_endpoint: `${baseUrl}/api/v1/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: [
            'authorization_code',
            'refresh_token',
            'client_credentials',
        ],
        token_endpoint_auth_methods_supported: [
            'client_secret_basic',
            'client_secret_post',
        ],
        code_challenge_methods_supported: ['S256', 'plain'],
        scopes_supported: [OAuthScope.MCP_READ, OAuthScope.MCP_WRITE],
        pkce_required: false, // PKCE is optional but recommended
    };
}

// Export the handler for reuse at root level
export const oauthAuthorizationServerHandler = (
    req: express.Request,
    res: express.Response,
) => {
    const baseUrl = getOAuthService(req).getSiteUrl();
    res.json(oauthConfig(baseUrl));
};

oauthRouter.get(
    '/.well-known/oauth-authorization-server',
    oauthAuthorizationServerHandler,
);

// MCP server discovery endpoint
// This endpoint is used to discover the MCP server
// Required by some tools
oauthRouter.get(
    '/.well-known/oauth-authorization-server/api/v1/mcp',
    oauthAuthorizationServerHandler,
);

// OAuth2 Protected Resource configuration
export function oauthProtectedResourceConfig(baseUrl: string) {
    return {
        resource: `${baseUrl}/api/v1/mcp`,
        authorization_servers: [baseUrl],
        bearer_methods_supported: ['header'],
        scopes_supported: [OAuthScope.MCP_READ, OAuthScope.MCP_WRITE],
        resource_documentation: `${baseUrl}/api/v1/oauth/.well-known/oauth-authorization-server`,
        introspection_endpoint: `${baseUrl}/api/v1/oauth/introspect`,
        revocation_endpoint: `${baseUrl}/api/v1/oauth/revoke`,
    };
}

// OAuth2 Protected Resource Discovery endpoint
// This endpoint provides metadata about the protected resource server
// This will be requested by the MCP client if authentication fails,
// The endpoint is provided by the returnHeaderIfUnauthenticated method in mcpRouter.ts
// Export the handler for reuse at root level
export const oauthProtectedResourceHandler = (
    req: express.Request,
    res: express.Response,
) => {
    const baseUrl = getOAuthService(req).getSiteUrl();
    res.json(oauthProtectedResourceConfig(baseUrl));
};

oauthRouter.get(
    '/.well-known/oauth-protected-resource',
    oauthProtectedResourceHandler,
);

// MCP server protected resource discovery endpoint
// This endpoint is used to discover the protected resource for MCP
// Required by some MCP clients
oauthRouter.get(
    '/.well-known/oauth-protected-resource/api/v1/mcp',
    oauthProtectedResourceHandler,
);

export default oauthRouter;
