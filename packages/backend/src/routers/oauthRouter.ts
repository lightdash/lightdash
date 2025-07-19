import express from 'express';

import { AnyType } from '@lightdash/common';
import OAuth2Server, {
    Request as OAuthRequest,
    Response as OAuthResponse,
} from '@node-oauth/oauth2-server';

export const oauthRouter = express.Router({ mergeParams: true });

// OAuth Discovery endpoint
oauthRouter.get('/.well-known/oauth-authorization-server', (req, res) => {
    res.json({
        issuer: 'http://localhost:3000',
        authorization_endpoint: 'http://localhost:3000/api/v1/oauth/authorize',
        token_endpoint: 'http://localhost:3000/api/v1/oauth/token',
        introspection_endpoint: 'http://localhost:3000/api/v1/oauth/introspect',
        revocation_endpoint: 'http://localhost:3000/api/v1/oauth/revoke',
        scopes_supported: ['read', 'write'],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
        code_challenge_methods_supported: ['S256', 'plain'],
    });
});

// Post token - use OAuth2Server
oauthRouter.post('/token', async (req, res, next) => {
    const oauthReq = new OAuth2Server.Request(req);
    const oauthRes = new OAuth2Server.Response(res);

    const oauthService = req.services.getOauthService();
    const oauthServer = oauthService.getOAuthServer();

    try {
        const token = await oauthServer.token(oauthReq, oauthRes);
        res.json(token);
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

// Get authorization - use OAuth2Server
oauthRouter.get('/authorize', async (req, res, next) => {
    if (!req.user) {
        const loginUrl = `/login?redirect=${encodeURIComponent(
            req.originalUrl || req.url,
        )}`;
        return res.redirect(loginUrl);
    }

    // Set user context for OAuth2Server - the OAuth2Server will pass this to our model methods
    (req as AnyType).user = {
        userUuid: req.user.userUuid,
        organizationUuid: req.user.organizationUuid,
    };

    const oauthReq = new OAuth2Server.Request(req);
    const oauthRes = new OAuth2Server.Response(res);

    const oauthService = req.services.getOauthService();
    const oauthServer = oauthService.getOAuthServer();

    try {
        return await oauthServer.authorize(oauthReq, oauthRes);
        // OAuth2Server will handle the redirect automatically
    } catch (error) {
        console.error('Authorization error:', error);
        const redirectUrl = new URL(req.query.redirect_uri as string);
        redirectUrl.searchParams.set('error', 'server_error');
        if (req.query.state)
            redirectUrl.searchParams.set('state', req.query.state as string);
        return res.redirect(redirectUrl.toString());
    }
});

// Token introspection endpoint
oauthRouter.post('/introspect', async (req, res) => {
    const oauthService = req.services.getOauthService();
    const { token, token_type_hint: tokenTypeHint } = req.body;

    try {
        const result = await oauthService.introspectToken(token, tokenTypeHint);
        return res.json(result);
    } catch (error) {
        console.error('Token introspection error:', error);
        return res.json({ active: false });
    }
});

// Token revocation endpoint
oauthRouter.post('/revoke', async (req, res) => {
    const oauthService = req.services.getOauthService();
    const { token, token_type_hint: tokenTypeHint } = req.body;

    try {
        if (
            tokenTypeHint === 'refresh_token' ||
            token?.startsWith('refresh_')
        ) {
            await oauthService.revokeRefreshToken(token);
        } else {
            await oauthService.revokeAccessToken(token);
        }
        return res.status(200).json({});
    } catch (error) {
        console.error('Token revocation error:', error);
        return res.status(400).json({ error: 'Invalid token' });
    }
});
