import {
    AnyType,
    OauthAuthenticationError,
    OAuthIntrospectRequest,
    OAuthIntrospectResponse,
    OAuthRevokeRequest,
    OAuthTokenRequest,
    OAuthTokenResponse,
} from '@lightdash/common';
import {
    Body,
    Get,
    OperationId,
    Post,
    Query,
    Request,
    Route,
    Tags,
} from '@tsoa/runtime';

import express from 'express';
import { DEFAULT_OAUTH_CLIENT_ID } from '../models/OAuthModel';
import { BaseController } from './baseController';

// OAuth2 error response interface following RFC 6749
interface OAuthErrorResponse {
    error: string;
    error_description?: string;
    error_uri?: string;
}

@Route('/api/v1/oauth')
@Tags('OAuth')
export class OAuthController extends BaseController {
    /**
     * OAuth2 Discovery endpoint
     * Returns OAuth2 server metadata with PKCE support
     * @param req express request
     */
    @Get('/.well-known/oauth-authorization-server')
    @OperationId('OAuthDiscovery')
    async discovery(@Request() req: express.Request) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        this.setStatus(200);
        return {
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
        };
    }

    /**
     * OAuth2 Authorization endpoint
     * Initiates the authorization code flow with PKCE support
     * @param req express request
     * @param response_type Must be 'code'
     * @param client_id The client identifier
     * @param redirect_uri The redirect URI
     * @param scope Optional scope
     * @param state Optional state parameter
     * @param code_challenge PKCE code challenge
     * @param code_challenge_method PKCE code challenge method (S256 or plain)
     */
    @Get('/authorize')
    @OperationId('OAuthAuthorize')
    async authorize(
        @Request() req: express.Request,
        @Query() response_type: string,
        @Query() redirect_uri: string,
        @Query() scopes?: string,
        @Query() state?: string,
        @Query() code_challenge?: string,
        @Query() code_challenge_method?: 'S256' | 'plain',
    ): Promise<void> {
        // Validate response_type
        if (response_type !== 'code') {
            this.setStatus(400);
            throw new OauthAuthenticationError('response_type must be "code"', {
                error: 'invalid_request',
            });
        }

        // Get OAuth service
        const oauthService = req.services.getOauthService();

        // Validate PKCE parameters if provided
        await oauthService.validateCodeChallenge(
            code_challenge,
            code_challenge_method,
        );

        // If user is not authenticated, redirect to login
        if (!req.user) {
            // Reconstruct the original authorize URL
            const originalUrl = req.originalUrl || req.url;
            const loginUrl = `/login?redirect=${encodeURIComponent(
                originalUrl,
            )}`;
            this.setStatus(302);
            this.setHeader('Location', loginUrl);
            return;
        }

        // Validate user data
        if (!req.user.userUuid || !req.user.organizationUuid) {
            this.setStatus(400);
            throw new OauthAuthenticationError('Invalid user authentication', {
                error: 'invalid_request',
            });
        }

        const authorizationCode = await oauthService.generateAuthorizationCode({
            redirectUri: redirect_uri || '',
            scopes: scopes ? scopes.split(' ') : [],
            userUuid: req.user.userUuid,
            organizationUuid: req.user.organizationUuid,
            codeChallenge: code_challenge,
            codeChallengeMethod: code_challenge_method,
        });

        // Redirect to redirect_uri with code and state
        const redirectUrl = new URL(redirect_uri);
        redirectUrl.searchParams.set('code', authorizationCode);
        if (state) redirectUrl.searchParams.set('state', state);

        this.setStatus(302);
        this.setHeader('Location', redirectUrl.toString());
    }

    /**
     * OAuth2 Token endpoint
     * Exchanges authorization code for access token with PKCE validation
     * @param req express request
     * @param body Token request parameters
     */
    @Post('/token')
    @OperationId('OAuthToken')
    async token(
        @Request() req: express.Request,
        @Body() body: OAuthTokenRequest,
    ): Promise<OAuthTokenResponse> {
        this.setStatus(200);
        const oauthService = req.services.getOauthService();

        switch (body.grant_type) {
            case 'authorization_code':
                const tokenResponse =
                    await oauthService.getAuthorizationCodeForController(body);
                return tokenResponse;
            case 'refresh_token':
                const refreshTokenResponse =
                    await oauthService.refreshTokenForController(body);
                return refreshTokenResponse;
            case 'client_credentials':
                throw new OauthAuthenticationError(
                    'Client credentials grant not implemented yet',
                    { error: 'unsupported_grant_type' },
                );
            default:
                throw new OauthAuthenticationError(
                    `Unsupported grant type: ${body.grant_type}`,
                    { error: 'unsupported_grant_type' },
                );
        }
    }

    /**
     * OAuth2 Token Introspection endpoint
     * Returns information about a token
     * @param req express request
     * @param body Introspection request parameters
     */
    @Post('/introspect')
    @OperationId('OAuthIntrospect')
    async introspect(
        @Request() req: express.Request,
        @Body() body: OAuthIntrospectRequest,
    ): Promise<OAuthIntrospectResponse> {
        if (!body.token) {
            this.setStatus(400);
            throw new OauthAuthenticationError('token is required', {
                error: 'invalid_request',
            });
        }

        // Get OAuth service
        const oauthService = req.services.getOauthService();
        const { token } = body;

        // Get token from database
        const accessToken = await oauthService.getAccessTokenForController(
            token || '',
        );
        if (!accessToken) {
            this.setStatus(200);
            return { active: false };
        }

        // Check if token has expired
        if (accessToken.expiresAt < new Date()) {
            this.setStatus(200);
            return { active: false };
        }

        const user = await req.services.getUserService().findSessionUser({
            id: accessToken.userUuid,
            organization: accessToken.organizationUuid,
        });

        // Get user information - we'll use a simple approach for now
        this.setStatus(200);
        return {
            active: true,
            scope: accessToken.scopes?.join(' ') || 'read write',
            client_id: DEFAULT_OAUTH_CLIENT_ID,
            username: user.email,
            token_type: 'access_token',
            exp: Math.floor(accessToken.expiresAt.getTime() / 1000),
            iat: Math.floor(accessToken.createdAt.getTime() / 1000),
            sub: accessToken.userUuid,
            aud: DEFAULT_OAUTH_CLIENT_ID,
            iss: 'lightdash',
            jti: accessToken.accessToken,
        };
    }

    /**
     * OAuth2 Token Revocation endpoint
     * Revokes an access or refresh token
     * @param req express request
     * @param body Revocation request parameters
     */
    @Post('/revoke')
    @OperationId('OAuthRevoke')
    async revoke(
        @Request() req: express.Request,
        @Body() body: OAuthRevokeRequest,
    ): Promise<void> {
        if (!body.token) {
            this.setStatus(400);
            throw new OauthAuthenticationError('token is required', {
                error: 'invalid_request',
            });
        }

        // Get OAuth service
        const oauthService = req.services.getOauthService();
        const { token } = body;

        // Try to revoke as access token first
        const accessToken = await oauthService.getAccessTokenForController(
            token || '',
        );
        if (accessToken) {
            await oauthService.revokeAccessTokenForController(token || '');
        } else {
            // Try to revoke as refresh token
            const refreshToken =
                await oauthService.getRefreshTokenForController(token || '');
            if (refreshToken) {
                await oauthService.revokeRefreshTokenForController(token || '');
            }
        }

        // OAuth2 revocation endpoint should return 200 with empty body on success
        this.setStatus(200);
    }
}
