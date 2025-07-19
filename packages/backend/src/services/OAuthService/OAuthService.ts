/* eslint-disable class-methods-use-this */
import {
    AnyType,
    AuthorizationCode,
    AuthTokenPrefix,
    ForbiddenError,
    NotFoundError,
    OauthAuthenticationError,
    OAuthClient,
    OAuthToken,
    OAuthTokenRequest,
    OAuthTokenResponse,
    RefreshToken,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { LightdashConfig } from '../../config/parseConfig';
import { DEFAULT_OAUTH_CLIENT_ID, OAuthModel } from '../../models/OAuthModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';

const EXPIRE_ACCESS_TOKENS_HOURS = 1;
const EXPIRE_REFRESH_TOKEN_DAYS = 30;

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
                getAuthorizationCode: this.getAuthorizationCode.bind(this),
                getClient: this.getClient.bind(this),
                saveToken: this.saveToken.bind(this),
                getAccessToken: this.getAccessToken.bind(this),
                verifyScope: this.verifyScope.bind(this),
                getRefreshToken: this.getRefreshToken.bind(this),
                revokeToken: this.revokeToken.bind(this),
                saveAuthorizationCode:
                    this.saveAuthorizationCodeServer.bind(this),
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
        redirectUri?: string,
    ): Promise<OAuthClient | false> {
        const client = await this.oauthModel.getClient();
        if (!client) {
            return false;
        }

        // Validate client ID
        if (client.clientId !== clientId) {
            return false;
        }

        // Validate redirect URI if provided
        if (redirectUri && client.redirectUris) {
            const isValidRedirectUri = client.redirectUris.some(
                (allowedUri) => {
                    // Handle wildcard patterns like 'http://localhost:*'
                    if (allowedUri.includes('*')) {
                        const pattern = allowedUri.replace('*', '.*');
                        const regex = new RegExp(pattern);
                        return regex.test(redirectUri);
                    }
                    return allowedUri === redirectUri;
                },
            );

            if (!isValidRedirectUri) {
                return false;
            }
        }

        return client;
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

    public async getAccessToken(
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
            accessTokenCreatedAt: token.createdAt,
            accessTokenExpiresAt: token.expiresAt,
            scopes: token.scopes || undefined,
            client,
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
            client,
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
        // Extract PKCE information from the code object if available
        const extendedCode = code as AuthorizationCode & {
            codeChallenge?: string;
            codeChallengeMethod?: 'S256' | 'plain';
        };
        const pkceInfo = extendedCode.codeChallenge
            ? {
                  code_challenge: extendedCode.codeChallenge,
                  code_challenge_method:
                      extendedCode.codeChallengeMethod || null,
              }
            : {
                  code_challenge: null,
                  code_challenge_method: null,
              };

        // Also check if PKCE info is in the request context
        const { request } = code as AnyType;
        let finalPkceInfo = pkceInfo;
        if (request?.body?.code_challenge) {
            finalPkceInfo = {
                code_challenge: request.body.code_challenge,
                code_challenge_method:
                    request.body.code_challenge_method || null,
            };
        }

        // Get user context from the request if not provided
        let userContext = user;
        if (request?.user && (!user.userUuid || !user.organizationUuid)) {
            userContext = request.user;
        }

        const savedCode = await this.oauthModel.saveAuthorizationCode({
            authorization_code: code.authorizationCode,
            expires_at: code.expiresAt,
            redirect_uri: code.redirectUri,
            scopes: code.scopes || ['read', 'write'],
            user_uuid: userContext.userUuid,
            organization_uuid: userContext.organizationUuid,
            ...finalPkceInfo,
        });

        return {
            ...code,
            client,
            user: userContext,
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

        // Create the authorization code object with PKCE information
        const authCode: AuthorizationCode & {
            codeChallenge?: string;
            codeChallengeMethod?: 'S256' | 'plain';
        } = {
            authorizationCode: code.authorizationCode,
            expiresAt: code.expiresAt,
            redirectUri: code.redirectUri,
            scopes: code.scopes || ['read', 'write'],
            client,
            user: {
                userUuid: code.userUuid,
                organizationUuid: code.organizationUuid,
            },
        };

        // Add PKCE information if available
        if (code.codeChallenge) {
            authCode.codeChallenge = code.codeChallenge;
        }
        if (code.codeChallengeMethod) {
            authCode.codeChallengeMethod = code.codeChallengeMethod;
        }

        return authCode;
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
    public async refreshToken(
        tokenRequest: OAuthTokenRequest,
    ): Promise<OAuthTokenResponse> {
        if (!tokenRequest.refresh_token) {
            throw new OauthAuthenticationError(
                'refresh_token is required for refresh_token grant type',
            );
        }

        const { refresh_token: refreshToken } = tokenRequest;

        // Get refresh token from database
        const refreshTokenData = await this.getRefreshToken(refreshToken);
        if (!refreshTokenData) {
            throw new OauthAuthenticationError('Invalid refresh token');
        }

        // Check if refresh token has expired
        if (refreshTokenData.expiresAt < new Date()) {
            await this.revokeRefreshToken(refreshToken || '');
            throw new OauthAuthenticationError('Refresh token has expired');
        }

        // Generate new access token
        const accessToken = this.generateAccessToken();
        const accessTokenExpiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

        // Save new access token to database

        await this.oauthModel.saveAccessToken({
            access_token: accessToken,
            expires_at: accessTokenExpiresAt,
            scopes: refreshTokenData.scopes || ['read', 'write'],
            user_uuid: refreshTokenData.user.userUuid,
            organization_uuid: refreshTokenData.user.organizationUuid,
            authorization_code_uuid: null,
        });

        return {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: refreshToken || '', // Return the same refresh token
            scope: refreshTokenData.scopes?.join(' ') || 'read write',
        };
    }

    public async authorizeCode(
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
            await this.oauthModel.revokeAuthorizationCode(
                codeData.authorizationCodeUuid,
            );
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
        await this.oauthModel.revokeAuthorizationCode(
            codeData.authorizationCodeUuid,
        );

        // Generate access and refresh tokens
        const accessToken = this.generateAccessToken();
        const refreshToken = this.generateRefreshToken();
        const accessTokenExpiresAt = new Date(
            Date.now() + EXPIRE_ACCESS_TOKENS_HOURS * 3600 * 1000,
        ); // 1 hour
        const refreshTokenExpiresAt = new Date(
            Date.now() + EXPIRE_REFRESH_TOKEN_DAYS * 24 * 3600 * 1000,
        );

        // Save tokens to database
        const accessTokenData = await this.oauthModel.saveAccessToken({
            access_token: accessToken,
            expires_at: accessTokenExpiresAt,
            scopes: codeData.scopes || ['read', 'write'],
            user_uuid: codeData.userUuid,
            organization_uuid: codeData.organizationUuid,
            authorization_code_uuid: null,
        });

        await this.oauthModel.saveRefreshToken({
            refresh_token: refreshToken,
            expires_at: refreshTokenExpiresAt,
            scopes: codeData.scopes || ['read', 'write'],
            user_uuid: codeData.userUuid,
            organization_uuid: codeData.organizationUuid,
            access_token_uuid: accessTokenData.accessTokenUuid,
        });

        return {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: refreshToken,
            scope: codeData.scopes?.join(' ') || 'read write',
        };
    }

    // Used in middelware to authenticate with oauth token
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

    public async revokeAccessToken(accessToken: string): Promise<void> {
        const token = await this.oauthModel.getAccessToken(accessToken);
        if (token) {
            await this.oauthModel.revokeAccessToken(token.accessTokenUuid);
        }
    }

    public async revokeRefreshToken(refreshToken: string): Promise<void> {
        const token = await this.oauthModel.getRefreshToken(refreshToken);
        if (token) {
            await this.oauthModel.revokeRefreshToken(token.refreshTokenUuid);
        }
    }

    public async introspectToken(
        token: string,
        tokenTypeHint?: string,
    ): Promise<{
        active: boolean;
        scope?: string;
        token_type?: string;
        exp?: number;
    }> {
        try {
            if (
                tokenTypeHint === 'refresh_token' ||
                token?.startsWith('refresh_')
            ) {
                const refreshToken = await this.getRefreshToken(token);
                if (refreshToken && refreshToken.expiresAt > new Date()) {
                    return {
                        active: true,
                        scope: refreshToken.scopes?.join(' '),
                        token_type: 'refresh_token',
                        exp: Math.floor(
                            refreshToken.expiresAt.getTime() / 1000,
                        ),
                    };
                }
            } else {
                const accessToken = await this.getAccessToken(token);
                if (
                    accessToken &&
                    accessToken.accessTokenExpiresAt > new Date()
                ) {
                    return {
                        active: true,
                        scope: accessToken.scopes?.join(' '),
                        token_type: 'access_token',
                        exp: Math.floor(
                            accessToken.accessTokenExpiresAt.getTime() / 1000,
                        ),
                    };
                }
            }
            return { active: false };
        } catch (error) {
            return { active: false };
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
}
