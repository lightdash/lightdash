/* eslint-disable @typescript-eslint/naming-convention */
import {
    generateOAuthAuthorizePage,
    generateOAuthRedirectPage,
    getErrorMessage,
    OAuthIntrospectResponse,
    parseScopeString,
    type OAuthUserInfoResponse,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import express, { type Router } from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
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

const getValidatedRedirectUrl = async (
    req: express.Request,
    params: { clientId: unknown; redirectUri: unknown },
): Promise<URL | null> => {
    const { clientId, redirectUri } = params;
    if (typeof clientId !== 'string' || typeof redirectUri !== 'string') {
        return null;
    }

    const isRegistered = await getOAuthService(req).validateRedirectUri(
        clientId,
        redirectUri,
    );
    if (!isRegistered) {
        return null;
    }

    try {
        return new URL(redirectUri);
    } catch {
        return null;
    }
};

const sendInvalidRedirectResponse = (res: express.Response) =>
    res.status(400).json({
        error: 'invalid_request',
        error_description: 'Invalid client_id or redirect_uri',
    });

const sendOAuthRedirectResponse = (
    res: express.Response,
    redirectUrl: URL,
    message: string,
) => {
    res.set('Content-Type', 'text/html');
    return res.send(
        generateOAuthRedirectPage({
            redirectUrl: redirectUrl.toString(),
            message,
        }),
    );
};

type OAuthIdentity =
    | { missingField: string }
    | { userId: number; organizationUuid: string };

const resolveOAuthIdentity = (user: Express.User): OAuthIdentity => {
    if (!user.userId) return { missingField: 'userId' };
    if (!user.organizationUuid) return { missingField: 'organizationUuid' };
    return {
        userId: user.userId,
        organizationUuid: user.organizationUuid,
    };
};

const getInstanceHost = (req: express.Request): string => {
    const siteUrl = getOAuthService(req).getSiteUrl();
    try {
        return new URL(siteUrl).host;
    } catch {
        return siteUrl;
    }
};

const sendMissingOrganizationResponse = async (
    req: express.Request,
    res: express.Response,
    params: {
        missingField: string;
        clientId: unknown;
        redirectUri: unknown;
        state: unknown;
    },
) => {
    Logger.warn(
        `OAuth authorize rejected: the session user is missing ${params.missingField}`,
    );

    const redirectUrl = await getValidatedRedirectUrl(req, {
        clientId: params.clientId,
        redirectUri: params.redirectUri,
    });
    if (!redirectUrl) {
        return sendInvalidRedirectResponse(res);
    }

    const message = `Your account is not a member of an organization on ${getInstanceHost(
        req,
    )}. Sign in to the Lightdash instance where you were invited.`;
    redirectUrl.searchParams.set('error', 'access_denied');
    redirectUrl.searchParams.set('error_description', message);
    if (typeof params.state === 'string' && params.state !== '') {
        redirectUrl.searchParams.set('state', params.state);
    }
    return sendOAuthRedirectResponse(res, redirectUrl, message);
};

// Get authorization - use OAuth2Server
oauthRouter.get('/authorize', async (req, res, next) => {
    const loginUrl = `/login?redirect=${encodeURIComponent(
        req.originalUrl || req.url,
    )}`;
    if (!req.user) {
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

    const identity = resolveOAuthIdentity(req.user);
    if ('missingField' in identity) {
        return sendMissingOrganizationResponse(req, res, {
            missingField: identity.missingField,
            clientId: client_id,
            redirectUri: redirect_uri,
            state,
        });
    }

    // Render authorize page using Handlebars template
    const scopeString = (scope as string) || '';
    const clientName = await getOAuthService(req).getClientDisplayName(
        client_id as string,
    );
    res.set('Content-Type', 'text/html');
    return res.send(
        generateOAuthAuthorizePage({
            action: '/api/v1/oauth/authorize',
            client_id: client_id as string,
            client_name: clientName,
            scope: scopeString,
            scopes: parseScopeString(scopeString),
            user: {
                firstName: req.user.firstName,
                lastName: req.user.lastName,
                email: req.user.email ?? null,
                organizationName: req.user.organizationName ?? '',
            },
            loginUrl,
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
    if (!req.user) {
        return res.status(401).send('Unauthorized');
    }
    const identity = resolveOAuthIdentity(req.user);
    if ('missingField' in identity) {
        return sendMissingOrganizationResponse(req, res, {
            missingField: identity.missingField,
            clientId: req.body.client_id,
            redirectUri: req.body.redirect_uri,
            state: req.body.state,
        });
    }

    const redirectUrl = await getValidatedRedirectUrl(req, {
        clientId: req.body.client_id,
        redirectUri: req.body.redirect_uri,
    });
    if (!redirectUrl) {
        return sendInvalidRedirectResponse(res);
    }

    if (req.body.approve === 'false') {
        redirectUrl.searchParams.set('error', 'access_denied');
        if (req.body.state) {
            redirectUrl.searchParams.set('state', req.body.state);
        }
        return sendOAuthRedirectResponse(
            res,
            redirectUrl,
            'Access denied. Redirecting you back to your application...',
        );
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
                userId: identity.userId,
                organizationUuid: identity.organizationUuid,
            },
        );
        redirectUrl.searchParams.set(
            'code',
            authorizationCode.authorizationCode,
        );
        if (req.body.state) {
            redirectUrl.searchParams.set('state', req.body.state);
        }

        return sendOAuthRedirectResponse(
            res,
            redirectUrl,
            'Redirecting you back to your application...',
        );
    } catch (error) {
        Logger.error(`Authorization error: ${error}`);
        const errorUrl = new URL(req.body.redirect_uri);
        errorUrl.searchParams.set('error', 'server_error');
        if (req.body.state) {
            errorUrl.searchParams.set('state', req.body.state);
        }
        return sendOAuthRedirectResponse(
            res,
            errorUrl,
            'An error occurred. Redirecting you back to your application...',
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

        if (error instanceof OAuth2Server.OAuthError) {
            res.status(error.code ?? 400).json({
                error: error.name,
                error_description: error.message,
            });
            return;
        }

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
// NOTE: RFC 7662 specifies that introspection should accept client credentials (client_id + client_secret),
// but we intentionally require a user session (req.user) instead. This is more restrictive than spec —
// MCP clients with valid OAuth tokens cannot introspect their own tokens, only session-authenticated users can.
// If MCP clients need introspection in the future, this should be updated to accept client credentials auth.
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
                    tokenData.accessTokenExpiresAt.getTime() / 1000 - 3600, // issued at: token created timestamp
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
// Used by MCP clients to self-register — must remain unauthenticated
oauthRouter.post('/register', async (req, res) => {
    try {
        const { client_name, redirect_uris, scope, grantTypes } = req.body;

        Logger.info(
            `Registering Oauth client ${client_name} with redirect_uris ${redirect_uris} and scopes ${scope}`,
        );

        if (!client_name || !redirect_uris || !Array.isArray(redirect_uris)) {
            return res.status(400).json({
                error: 'invalid_client_metadata',
                error_description: 'client_name and redirect_uris are required',
            });
        }

        const scopes = typeof scope === 'string' ? scope.split(' ') : [];

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

// UserInfo endpoint (OpenID Connect)
oauthRouter.get(
    '/userinfo',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res) => {
        const user = req.user!;
        const userInfo: OAuthUserInfoResponse = {
            sub: user.userUuid,
            name: `${user.firstName} ${user.lastName}`.trim(),
            given_name: user.firstName,
            family_name: user.lastName,
            email: user.email,
            email_verified: true,
            organization_uuid: user.organizationUuid,
            organization_name: user.organizationName,
        };
        return res.json(userInfo);
    },
);

// Client management endpoints (admin UI)
oauthRouter.get(
    '/clients',
    allowApiKeyAuthentication,
    isAuthenticated,
    async (req, res, next) => {
        try {
            const oauthService = getOAuthService(req);
            const clients = await oauthService.listClients(req.account!);
            return res.json({ status: 'ok', results: clients });
        } catch (error) {
            return next(error);
        }
    },
);

oauthRouter.post(
    '/clients',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const { clientName, redirectUris } = req.body;
            const oauthService = getOAuthService(req);
            const client = await oauthService.createAdminClient(req.account!, {
                clientName,
                redirectUris,
            });
            return res.status(201).json({ status: 'ok', results: client });
        } catch (error) {
            return next(error);
        }
    },
);

oauthRouter.patch(
    '/clients/:clientId',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const { clientId } = req.params;
            const { clientName, redirectUris } = req.body;
            const oauthService = getOAuthService(req);
            const client = await oauthService.updateClient(
                req.account!,
                clientId,
                { clientName, redirectUris },
            );
            return res.json({ status: 'ok', results: client });
        } catch (error) {
            return next(error);
        }
    },
);

oauthRouter.delete(
    '/clients/:clientId',
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
    async (req, res, next) => {
        try {
            const { clientId } = req.params;
            const oauthService = getOAuthService(req);
            await oauthService.deleteClient(req.account!, clientId);
            return res.json({ status: 'ok', results: undefined });
        } catch (error) {
            return next(error);
        }
    },
);

// OAuth2 Discovery endpoint
// This endpoint is used by MCP clients and other OAuth clients to discover the OAuth2 server
export function oauthConfig(baseUrl: string) {
    return {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/api/v1/oauth/authorize`,
        token_endpoint: `${baseUrl}/api/v1/oauth/token`,
        introspection_endpoint: `${baseUrl}/api/v1/oauth/introspect`,
        revocation_endpoint: `${baseUrl}/api/v1/oauth/revoke`,
        registration_endpoint: `${baseUrl}/api/v1/oauth/register`,
        userinfo_endpoint: `${baseUrl}/api/v1/oauth/userinfo`,
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
        code_challenge_methods_supported: ['S256'],
        scopes_supported: [
            OAuthScope.READ,
            OAuthScope.WRITE,
            OAuthScope.MCP_READ,
            OAuthScope.MCP_WRITE,
        ],
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
        scopes_supported: [
            OAuthScope.READ,
            OAuthScope.WRITE,
            OAuthScope.MCP_READ,
            OAuthScope.MCP_WRITE,
        ],
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
