/* eslint-disable @typescript-eslint/naming-convention */
import {
    generateOAuthAuthorizePage,
    OAuthIntrospectResponse,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import express from 'express';
import { DEFAULT_OAUTH_CLIENT_ID } from '../models/OAuth2Model';
import { OAuthService } from '../services/OAuthService/OAuthService';

const oauthRouter = express.Router({ mergeParams: true });

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
    if (!client_id || !redirect_uri || !scope) {
        return res.status(400).send('Missing required parameters');
    }
    // Render authorize page using Handlebars template
    res.set('Content-Type', 'text/html');
    return res.send(
        generateOAuthAuthorizePage({
            action: '/api/v1/oauth/authorize',
            client_id: client_id as string,
            scope: scope as string,
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
                    value: scope as string,
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

oauthRouter.post('/authorize', async (req, res, next) => {
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
        return res.redirect(url.toString());
    }
    if (!req.user) {
        return res.status(401).send('Unauthorized');
    }
    if (!req.user.userId || !req.user.organizationUuid) {
        return res.status(400).send('Missing userUuid or organizationUuid');
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
        return res.redirect(url.toString());
    } catch (error) {
        console.error('Authorization error:', error);
        const redirectUrl = new URL(req.body.redirect_uri);
        redirectUrl.searchParams.set('error', 'server_error');
        if (req.body.state)
            redirectUrl.searchParams.set('state', req.body.state);
        return res.redirect(redirectUrl.toString());
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
            scope: token.scope,
        });
    } catch (error) {
        console.error('Token endpoint error:', error);
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
        console.error('Introspection error:', error);
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
        console.error('Revocation error:', error);
    }
    return res.status(200).send();
});

// OAuth2 Discovery endpoint
oauthRouter.get('/.well-known/oauth-authorization-server', (req, res) => {
    const baseUrl = getOAuthService(req).getSiteUrl();

    res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/api/v1/oauth/authorize`,
        token_endpoint: `${baseUrl}/api/v1/oauth/token`,
        introspection_endpoint: `${baseUrl}/api/v1/oauth/introspect`,
        revocation_endpoint: `${baseUrl}/api/v1/oauth/revoke`,
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
        scopes_supported: ['read', 'write'],
        code_challenge_methods_supported: ['S256', 'plain'],
        pkce_required: false, // PKCE is optional but recommended
    });
});

export default oauthRouter;
