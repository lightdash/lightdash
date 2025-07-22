import {
    AnyType,
    AuthTokenPrefix,
    ForbiddenError,
    NotFoundError,
    UserWithOrganizationUuid,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { NextFunction, Request, Response } from 'express';
import { LightdashConfig } from '../../config/parseConfig';
import { DEFAULT_OAUTH_CLIENT_ID, OAuth2Model } from '../../models/OAuth2Model';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';

type OAuthServiceArguments = {
    userModel: UserModel;
    oauthModel: OAuth2Model;
    lightdashConfig: LightdashConfig;
};

export class OAuthService extends BaseService {
    protected oauthServer!: OAuth2Server;

    private userModel: UserModel;

    private oauthModel: OAuth2Model;

    private lightdashConfig: LightdashConfig;

    constructor({
        userModel,
        oauthModel,
        lightdashConfig,
    }: OAuthServiceArguments) {
        super();
        this.userModel = userModel;
        this.oauthModel = oauthModel;
        this.lightdashConfig = lightdashConfig;
        this.initializeOAuthServer();
    }

    private initializeOAuthServer(): void {
        this.oauthServer = new OAuth2Server({
            model: this.oauthModel,
            allowBearerTokensInQueryString: true,
            accessTokenLifetime:
                this.lightdashConfig.auth.oauthServer?.accessTokenLifetime,
            refreshTokenLifetime:
                this.lightdashConfig.auth.oauthServer?.refreshTokenLifetime,
            // Allow public clients (no client authentication required for refresh tokens)
            requireClientAuthentication: {
                refresh_token: false, // Don't require for refresh token (public client)
            },
        });
    }

    public async authorize(
        request: OAuth2Server.Request,
        response: OAuth2Server.Response,
        user: UserWithOrganizationUuid,
    ): Promise<OAuth2Server.AuthorizationCode> {
        return this.oauthServer.authorize(request, response, {
            authenticateHandler: {
                handle: () => user,
            },
        });
    }

    public async token(
        request: OAuth2Server.Request,
        response: OAuth2Server.Response,
    ): Promise<OAuth2Server.Token> {
        return this.oauthServer.token(request, response);
    }

    public async authenticate(
        request: OAuth2Server.Request,
        response: OAuth2Server.Response,
    ): Promise<OAuth2Server.Token> {
        return this.oauthServer.authenticate(request, response);
    }

    public async revokeToken(token: string): Promise<boolean> {
        // Try to revoke as access token first
        const refreshToken = await this.oauthModel.getRefreshToken(token);
        if (refreshToken) return this.oauthModel.revokeToken(refreshToken);
        return false;
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

            const accessToken = await this.oauthModel.getAccessToken(
                oauthToken,
            );
            if (!accessToken) {
                throw new ForbiddenError('Invalid OAuth token');
            }
            const { sessionUser } =
                await this.userModel.getSessionUserFromCacheOrDB(
                    accessToken.user.userUuid,
                    accessToken.user.organizationUuid, // use from token
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
}
