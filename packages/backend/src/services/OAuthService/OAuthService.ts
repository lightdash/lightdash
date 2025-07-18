/* eslint-disable class-methods-use-this */
import {
    AuthTokenPrefix,
    ForbiddenError,
    NotFoundError,
    NotImplementedError,
    OauthAuthenticationError,
    OAuthTokenRequest,
    OAuthTokenResponse,
} from '@lightdash/common';
import OAuth2Server, {
    Request as OAuthRequest,
    Response as OAuthResponse,
} from '@node-oauth/oauth2-server';
import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { LightdashConfig } from '../../config/parseConfig';
import { DEFAULT_OAUTH_CLIENT_ID, OAuthModel } from '../../models/OAuthModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';

interface OAuthClient {
    id: string;
    clientId: string;
    clientSecret: string;
    redirectUris: string[];
    grants: string[];
    scopes?: string[];
}

interface OAuthToken {
    accessToken: string;
    accessTokenExpiresAt: Date;
    refreshToken?: string;
    refreshTokenExpiresAt?: Date;
    scopes?: string[];
    client: OAuthClient;
    user: { userUuid: string; organizationUuid: string };
}

interface AuthorizationCode {
    authorizationCode: string;
    expiresAt: Date;
    redirectUri: string;
    scopes?: string[];
    client: OAuthClient;
    user: { userUuid: string; organizationUuid: string };
}

interface RefreshToken {
    refreshToken: string;
    expiresAt: Date;
    scopes?: string[];
    client: OAuthClient;
    user: { userUuid: string; organizationUuid: string };
}

export class OAuthService extends BaseService {
    private oauthServer!: OAuth2Server;

    private userModel: UserModel;

    private oauthModel: OAuthModel;

    private lightdashConfig: LightdashConfig;

    constructor({
        userModel,
        oauthModel,
        lightdashConfig,
    }: {
        userModel: UserModel;
        oauthModel: OAuthModel;
        lightdashConfig: LightdashConfig;
    }) {
        super();
        this.userModel = userModel;
        this.oauthModel = oauthModel;
        this.lightdashConfig = lightdashConfig;
        this.initializeOAuthServer();
    }

    private initializeOAuthServer(): void {
        this.oauthServer = new OAuth2Server({
            model: {
                getClient: this.getClient.bind(this),
                saveToken: this.saveToken.bind(this),
                getAccessToken: this.getAccessToken.bind(this),
                verifyScope: this.verifyScope.bind(this),
                getRefreshToken: this.getRefreshToken.bind(this),
                revokeToken: this.revokeToken.bind(this),
                saveAuthorizationCode:
                    this.saveAuthorizationCodeServer.bind(this),
                getAuthorizationCode: this.getAuthorizationCode.bind(this),
                revokeAuthorizationCode:
                    this.revokeAuthorizationCode.bind(this),
            },
            accessTokenLifetime: 3600, // 1 hour
            refreshTokenLifetime: 1209600, // 14 days
            allowExtendedTokenAttributes: true,
            allowBearerTokensInQueryString: false,
        });
    }

    public getOAuthServer(): OAuth2Server {
        return this.oauthServer;
    }

    public validateCodeChallenge(
        codeChallenge?: string,
        codeChallengeMethod?: string,
    ) {
        if (codeChallenge) {
            if (!codeChallengeMethod) {
                throw new OauthAuthenticationError(
                    'code_challenge_method is required when code_challenge is provided',
                );
            }
            if (!['S256', 'plain'].includes(codeChallengeMethod)) {
                throw new OauthAuthenticationError(
                    `code_challenge_method must be "S256" or "plain", but was ${codeChallengeMethod}`,
                );
            }
            if (codeChallengeMethod === 'S256' && codeChallenge.length < 43) {
                throw new OauthAuthenticationError(
                    'code_challenge must be at least 43 characters for S256 method',
                );
            }
            if (codeChallengeMethod === 'plain' && codeChallenge.length < 43) {
                throw new OauthAuthenticationError(
                    'code_challenge must be at least 43 characters for plain method',
                );
            }
        }
    }

    public async generateAuthorizationCode({
        redirectUri,
        scopes,
        userUuid,
        organizationUuid,
        codeChallenge,
        codeChallengeMethod,
    }: {
        redirectUri: string;
        scopes: string[];
        userUuid: string;
        organizationUuid: string;
        codeChallenge?: string;
        codeChallengeMethod?: 'S256' | 'plain';
    }) {
        // Generate authorization code
        const authorizationCode = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        // Store the authorization code in database
        await this.saveAuthorizationCode({
            authorizationCode,
            expiresAt,
            redirectUri: redirectUri || '',
            scopes,
            clientId: DEFAULT_OAUTH_CLIENT_ID,
            userUuid,
            organizationUuid,
            ...(codeChallenge ? { codeChallenge } : {}),
            ...(codeChallengeMethod ? { codeChallengeMethod } : {}),
        });

        return authorizationCode;
    }

    // OAuth2 Model Methods
    private async getClient(
        clientId: string,
        clientSecret: string,
    ): Promise<OAuthClient | false> {
        const client = await this.oauthModel.getClient();
        if (!client) {
            return false;
        }

        return {
            id: client.clientUuid,
            clientId: client.clientId,
            clientSecret: client.clientSecret || '',
            redirectUris: client.redirectUris,
            grants: client.grants,
            scopes: client.scopes || undefined,
        };
    }

    private async saveToken(
        token: OAuthToken,
        client: OAuthClient,
        user: { userUuid: string; organizationUuid: string },
    ): Promise<OAuthToken | false> {
        try {
            // Save access token
            const accessToken = await this.oauthModel.saveAccessToken({
                access_token: token.accessToken,
                expires_at: token.accessTokenExpiresAt,
                scopes: token.scopes || ['read', 'write'],
                user_uuid: user.userUuid,
                organization_uuid: user.organizationUuid,
                authorization_code_uuid: null, // Will be set if from authorization code
            });

            // Save refresh token if provided
            if (token.refreshToken && token.refreshTokenExpiresAt) {
                await this.oauthModel.saveRefreshToken({
                    refresh_token: token.refreshToken,
                    expires_at: token.refreshTokenExpiresAt,
                    scopes: token.scopes || ['read', 'write'],
                    user_uuid: user.userUuid,
                    organization_uuid: user.organizationUuid,
                    access_token_uuid: accessToken.accessTokenUuid,
                });
            }

            return {
                ...token,
                client,
                user,
            };
        } catch (error) {
            return false;
        }
    }

    private async getAccessToken(
        accessToken: string,
    ): Promise<OAuthToken | false> {
        const token = await this.oauthModel.getAccessToken(accessToken);
        if (!token) {
            return false;
        }
        const client = await this.oauthModel.getClient();
        if (!client) {
            return false;
        }

        // Update last used timestamp
        await this.oauthModel.updateAccessTokenLastUsed(token.accessTokenUuid);

        return {
            accessToken: token.accessToken,
            accessTokenExpiresAt: token.expiresAt,
            scopes: token.scopes || undefined,
            client: {
                id: client.clientUuid,
                clientId: client.clientId,
                clientSecret: client.clientSecret || '',
                redirectUris: client.redirectUris,
                grants: client.grants,
                scopes: client.scopes || undefined,
            },
            user: {
                userUuid: token.userUuid,
                organizationUuid: token.organizationUuid,
            },
        };
    }

    // eslint-disable-next-line class-methods-use-this
    private async verifyScope(
        token: OAuthToken,
        scope: string[],
    ): Promise<boolean> {
        if (!token.scopes) {
            return false;
        }
        const tokenScopes = Array.isArray(token.scopes)
            ? token.scopes
            : [token.scopes];
        return scope.every((requiredScope) =>
            tokenScopes.includes(requiredScope),
        );
    }

    private async getRefreshToken(
        refreshToken: string,
    ): Promise<RefreshToken | false> {
        const token = await this.oauthModel.getRefreshToken(refreshToken);
        if (!token) {
            return false;
        }

        const client = await this.oauthModel.getClient();
        if (!client) {
            return false;
        }

        // Update last used timestamp
        await this.oauthModel.updateRefreshTokenLastUsed(
            token.refreshTokenUuid,
        );

        return {
            refreshToken: token.refreshToken,
            expiresAt: token.expiresAt,
            scopes: token.scopes || undefined,
            client: {
                id: client.clientUuid,
                clientId: client.clientId,
                clientSecret: client.clientSecret || '',
                redirectUris: client.redirectUris,
                grants: client.grants,
                scopes: client.scopes || undefined,
            },
            user: {
                userUuid: token.userUuid,
                organizationUuid: token.organizationUuid,
            },
        };
    }

    private async revokeToken(token: RefreshToken): Promise<boolean> {
        try {
            const refreshToken = await this.oauthModel.getRefreshToken(
                token.refreshToken,
            );
            if (refreshToken) {
                await this.oauthModel.revokeRefreshToken(
                    refreshToken.refreshTokenUuid,
                );
            }
            return true;
        } catch (error) {
            return false;
        }
    }

    private async saveAuthorizationCodeServer(
        code: AuthorizationCode,
        client: OAuthClient,
        user: { userUuid: string; organizationUuid: string },
    ): Promise<AuthorizationCode> {
        const savedCode = await this.oauthModel.saveAuthorizationCode({
            authorization_code: code.authorizationCode,
            expires_at: code.expiresAt,
            redirect_uri: code.redirectUri,
            scopes: code.scopes || ['read', 'write'],
            user_uuid: user.userUuid,
            organization_uuid: user.organizationUuid,
            code_challenge: null, // Will be set if PKCE is used
            code_challenge_method: null,
        });

        return {
            ...code,
            client,
            user,
        };
    }

    private async getAuthorizationCode(
        authorizationCode: string,
    ): Promise<AuthorizationCode | false> {
        const code = await this.oauthModel.getAuthorizationCode(
            authorizationCode,
        );
        if (!code) {
            return false;
        }

        const client = await this.oauthModel.getClient();
        if (!client) {
            return false;
        }

        return {
            authorizationCode: code.authorizationCode,
            expiresAt: code.expiresAt,
            redirectUri: code.redirectUri,
            scopes: code.scopes || ['read', 'write'],
            client: {
                id: client.clientUuid,
                clientId: client.clientId,
                clientSecret: client.clientSecret || '',
                redirectUris: client.redirectUris,
                grants: client.grants,
                scopes: client.scopes || ['read', 'write'],
            },
            user: {
                userUuid: code.userUuid,
                organizationUuid: code.organizationUuid,
            },
        };
    }

    private async revokeAuthorizationCode(
        code: AuthorizationCode,
    ): Promise<boolean> {
        try {
            const authCode = await this.oauthModel.getAuthorizationCode(
                code.authorizationCode,
            );
            if (authCode) {
                await this.oauthModel.revokeAuthorizationCode(
                    authCode.authorizationCodeUuid,
                );
            }
            return true;
        } catch (error) {
            return false;
        }
    }

    private generateAccessToken(): string {
        return `${AuthTokenPrefix.OAUTH_APP}${crypto
            .randomBytes(32)
            .toString('hex')}`;
    }

    private generateRefreshToken(): string {
        return `${AuthTokenPrefix.OAUTH_REFRESH}${crypto
            .randomBytes(32)
            .toString('hex')}`;
    }

    // Helper methods for the controller
    public async refreshTokenForController(
        tokenRequest: OAuthTokenRequest,
    ): Promise<OAuthTokenResponse> {
        if (!tokenRequest.refresh_token) {
            throw new OauthAuthenticationError(
                'refresh_token is required for refresh_token grant type',
            );
        }

        const { refresh_token: refreshToken } = tokenRequest;

        // Get refresh token from database
        const refreshTokenData = await this.getRefreshTokenForController(
            refreshToken,
        );
        if (!refreshTokenData) {
            throw new OauthAuthenticationError('Invalid refresh token');
        }

        // Check if refresh token has expired
        if (refreshTokenData.expiresAt < new Date()) {
            await this.revokeRefreshTokenForController(refreshToken || '');
            throw new OauthAuthenticationError('Refresh token has expired');
        }

        // Generate new access token
        const accessToken = this.generateAccessToken();
        const accessTokenExpiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

        // Save new access token to database
        await this.saveAccessTokenForController({
            accessToken,
            expiresAt: accessTokenExpiresAt,
            scopes: refreshTokenData.scopes,
            userUuid: refreshTokenData.userUuid,
            organizationUuid: refreshTokenData.organizationUuid,
        });

        return {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: refreshToken || '', // Return the same refresh token
            scope: refreshTokenData.scopes?.join(' ') || 'read write',
        };
    }

    public async getAuthorizationCodeForController(
        tokenRequest: OAuthTokenRequest,
    ): Promise<OAuthTokenResponse> {
        if (!tokenRequest.code) {
            throw new OauthAuthenticationError(
                'code is required for authorization_code grant type',
            );
        }

        const { code } = tokenRequest;

        // Get the authorization code from database
        const codeData = await this.oauthModel.getAuthorizationCode(code);
        if (!codeData) {
            throw new OauthAuthenticationError('Invalid authorization code');
        }

        // Check if code has expired
        if (codeData.expiresAt < new Date()) {
            await this.revokeAuthorizationCodeForController(code || '');
            throw new OauthAuthenticationError(
                'Authorization code has expired',
            );
        }

        // Validate PKCE if code challenge was provided
        if (codeData.codeChallenge && codeData.codeChallengeMethod) {
            if (!tokenRequest.code_verifier) {
                throw new OauthAuthenticationError(
                    'code_verifier is required for PKCE',
                );
            }

            const isValidVerifier = await this.validateCodeVerifier(
                tokenRequest.code_verifier,
                codeData.codeChallenge,
                codeData.codeChallengeMethod,
            );

            if (!isValidVerifier) {
                throw new OauthAuthenticationError('Invalid code verifier');
            }
        }

        // Remove the used authorization code
        await this.revokeAuthorizationCodeForController(code);

        // Generate access and refresh tokens
        const accessToken = this.generateAccessToken();
        const refreshToken = this.generateRefreshToken();
        const accessTokenExpiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour
        const refreshTokenExpiresAt = new Date(
            Date.now() + 30 * 24 * 3600 * 1000,
        ); // 30 days

        // Save tokens to database
        await this.saveAccessTokenForController({
            accessToken,
            expiresAt: accessTokenExpiresAt,
            scopes: codeData.scopes,
            userUuid: codeData.userUuid,
            organizationUuid: codeData.organizationUuid,
        });

        await this.saveRefreshTokenForController({
            refreshToken,
            expiresAt: refreshTokenExpiresAt,
            scopes: codeData.scopes,
            userUuid: codeData.userUuid,
            organizationUuid: codeData.organizationUuid,
        });

        return {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: refreshToken,
            scope: codeData.scopes?.join(' ') || 'read write',
        };
    }

    public async handleAuthorizationRequest(
        req: Request,
        res: Response,
    ): Promise<void> {
        const request = new OAuthRequest(req);
        const response = new OAuthResponse(res);

        try {
            const token = await this.oauthServer.authorize(request, response);
            res.status(200).json(token);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            res.status(400).json({ error: errorMessage });
        }
    }

    public async handleTokenRequest(
        req: Request,
        res: Response,
    ): Promise<void> {
        const request = new OAuthRequest(req);
        const response = new OAuthResponse(res);

        try {
            const token = await this.oauthServer.token(request, response);
            res.status(200).json(token);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            res.status(400).json({ error: errorMessage });
        }
    }

    public async handleRevokeRequest(
        req: Request,
        res: Response,
    ): Promise<void> {
        const request = new OAuthRequest(req);
        const response = new OAuthResponse(res);

        try {
            // Note: OAuth2Server doesn't have a built-in revoke method
            // We'll implement this manually
            const token = request.body.token || request.query?.token;
            if (token) {
                const refreshToken = await this.oauthModel.getRefreshToken(
                    token,
                );
                if (refreshToken) {
                    await this.oauthModel.revokeRefreshToken(
                        refreshToken.refreshTokenUuid,
                    );
                }
            }
            res.status(200).json({ message: 'Token revoked successfully' });
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            res.status(400).json({ error: errorMessage });
        }
    }

    public async handleIntrospectRequest(
        req: Request,
        res: Response,
    ): Promise<void> {
        try {
            const { token } = req.body;
            if (!token) {
                res.status(400).json({ error: 'Token is required' });
                return;
            }

            const accessToken = await this.oauthModel.getAccessToken(token);
            if (accessToken) {
                res.status(200).json({
                    active: true,
                    scopes: accessToken.scopes.join(' '),
                    user_id: accessToken.userUuid,
                    exp: Math.floor(accessToken.expiresAt.getTime() / 1000),
                });
            } else {
                res.status(200).json({ active: false });
            }
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
            res.status(400).json({ error: errorMessage });
        }
    }

    public async authenticateWithOauthToken(
        req: Request,
        next: NextFunction,
    ): Promise<void> {
        try {
            const token = req.headers.authorization;
            if (!token || typeof token !== 'string' || token.length === 0) {
                next();
                return;
            }
            const tokenParts = token.split(' ');
            const oauthToken = tokenParts[1];
            const isValidOauthToken =
                !oauthToken ||
                typeof oauthToken !== 'string' ||
                oauthToken.length === 0 ||
                !oauthToken.startsWith(AuthTokenPrefix.OAUTH_APP);
            if (tokenParts[0] !== 'Bearer' && !isValidOauthToken) {
                next();
                return;
            }

            const accessToken = await this.getAccessToken(oauthToken);
            if (!accessToken) {
                throw new ForbiddenError('Invalid OAuth token');
            }
            const { sessionUser } =
                await this.userModel.getSessionUserFromCacheOrDB(
                    accessToken.user.userUuid,
                    accessToken.user.organizationUuid,
                );
            if (!sessionUser) {
                throw new NotFoundError('User not found');
            }
            req.user = sessionUser;
            next();
        } catch (error) {
            next(error);
        }
    }

    private async saveAuthorizationCode(data: {
        authorizationCode: string;
        expiresAt: Date;
        redirectUri: string;
        scopes?: string[];
        clientId: string;
        userUuid: string;
        organizationUuid: string;
        codeChallenge?: string;
        codeChallengeMethod?: 'S256' | 'plain';
    }): Promise<void> {
        const client = await this.oauthModel.getClient();
        if (!client) {
            throw new Error('Invalid client');
        }

        await this.oauthModel.saveAuthorizationCode({
            authorization_code: data.authorizationCode,
            expires_at: data.expiresAt,
            redirect_uri: data.redirectUri,
            scopes: data.scopes || ['read', 'write'],
            user_uuid: data.userUuid,
            organization_uuid: data.organizationUuid,
            code_challenge: data.codeChallenge || null,
            code_challenge_method: data.codeChallengeMethod || null,
        });
    }

    public async revokeAuthorizationCodeForController(
        authorizationCode: string,
    ): Promise<void> {
        const code = await this.oauthModel.getAuthorizationCode(
            authorizationCode,
        );
        if (code) {
            await this.oauthModel.revokeAuthorizationCode(
                code.authorizationCodeUuid,
            );
        }
    }

    public async saveAccessTokenForController(data: {
        accessToken: string;
        expiresAt: Date;
        scopes?: string[];
        userUuid: string;
        organizationUuid: string;
    }): Promise<void> {
        const client = await this.oauthModel.getClient();
        if (!client) {
            throw new Error('Invalid client');
        }

        await this.oauthModel.saveAccessToken({
            access_token: data.accessToken,
            expires_at: data.expiresAt,
            scopes: data.scopes || ['read', 'write'],
            user_uuid: data.userUuid,
            organization_uuid: data.organizationUuid,
            authorization_code_uuid: null,
        });
    }

    public async saveRefreshTokenForController(data: {
        refreshToken: string;
        expiresAt: Date;
        scopes?: string[];
        userUuid: string;
        organizationUuid: string;
    }): Promise<void> {
        const client = await this.oauthModel.getClient();
        if (!client) {
            throw new Error('Invalid client');
        }

        // Get the access token to link to
        const accessToken = await this.oauthModel.getAccessTokenByUserAndClient(
            data.userUuid,
        );
        if (!accessToken) {
            throw new Error('No access token found for user');
        }

        await this.oauthModel.saveRefreshToken({
            refresh_token: data.refreshToken,
            expires_at: data.expiresAt,
            scopes: data.scopes || ['read', 'write'],
            user_uuid: data.userUuid,
            organization_uuid: data.organizationUuid,
            access_token_uuid: accessToken.accessTokenUuid,
        });
    }

    public async getAccessTokenForController(accessToken: string): Promise<{
        accessToken: string;
        expiresAt: Date;
        scopes?: string[];
        userUuid: string;
        organizationUuid: string;
        createdAt: Date;
    } | null> {
        const token = await this.oauthModel.getAccessToken(accessToken);
        if (!token) {
            return null;
        }

        const client = await this.oauthModel.getClient();
        if (!client) {
            return null;
        }

        // Update last used timestamp
        await this.oauthModel.updateAccessTokenLastUsed(token.accessTokenUuid);

        return {
            accessToken: token.accessToken,
            expiresAt: token.expiresAt,
            scopes: token.scopes || undefined,
            userUuid: token.userUuid,
            organizationUuid: token.organizationUuid,
            createdAt: token.createdAt,
        };
    }

    public async getRefreshTokenForController(refreshToken: string): Promise<{
        refreshToken: string;
        expiresAt: Date;
        scopes?: string[];
        userUuid: string;
        organizationUuid: string;
    } | null> {
        const token = await this.oauthModel.getRefreshToken(refreshToken);
        if (!token) {
            return null;
        }

        const client = await this.oauthModel.getClient();
        if (!client) {
            return null;
        }

        // Update last used timestamp
        await this.oauthModel.updateRefreshTokenLastUsed(
            token.refreshTokenUuid,
        );

        return {
            refreshToken: token.refreshToken,
            expiresAt: token.expiresAt,
            scopes: token.scopes || undefined,
            userUuid: token.userUuid,
            organizationUuid: token.organizationUuid,
        };
    }

    public async revokeAccessTokenForController(
        accessToken: string,
    ): Promise<void> {
        const token = await this.oauthModel.getAccessToken(accessToken);
        if (token) {
            await this.oauthModel.revokeAccessToken(token.accessTokenUuid);
        }
    }

    public async revokeRefreshTokenForController(
        refreshToken: string,
    ): Promise<void> {
        const token = await this.oauthModel.getRefreshToken(refreshToken);
        if (token) {
            await this.oauthModel.revokeRefreshToken(token.refreshTokenUuid);
        }
    }

    // eslint-disable-next-line class-methods-use-this
    public async validateCodeVerifier(
        codeVerifier: string,
        codeChallenge: string,
        codeChallengeMethod: string,
    ): Promise<boolean> {
        if (codeChallengeMethod === 'S256') {
            const hash = crypto
                .createHash('sha256')
                .update(codeVerifier)
                .digest('base64url');
            return hash === codeChallenge;
        }
        if (codeChallengeMethod === 'plain') {
            return codeVerifier === codeChallenge;
        }
        return false;
    }

    // eslint-disable-next-line class-methods-use-this
    public async createClient(data: {
        clientSecret: string;
        clientName: string;
        redirectUris: string[];
        grants: string[];
        scopes: string[];
        userUuid: string;
        organizationUuid: string;
    }): Promise<void> {
        throw new NotImplementedError('Not implemented');
    }
}
