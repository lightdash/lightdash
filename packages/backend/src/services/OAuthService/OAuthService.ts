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
            accessTokenLifetime: 60 * 60,
            refreshTokenLifetime: 60 * 60 * 24 * 30,
            allowBearerTokensInQueryString: true,
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
}
