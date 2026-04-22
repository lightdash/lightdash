import { subject } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    ParameterError,
    UserWithOrganizationUuid,
    type OAuthClientSummary,
    type SessionUser,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { LightdashConfig } from '../../config/parseConfig';
import { OAuth2Model } from '../../models/OAuth2Model';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';

export enum OAuthScope {
    READ = 'read',
    WRITE = 'write',
    MCP_READ = 'mcp:read',
    MCP_WRITE = 'mcp:write',
}

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
            allowEmptyState: true, // Make state parameter optional for MCP compatibility
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

    public getSiteUrl() {
        return `${this.lightdashConfig.siteUrl}`;
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

    public async registerClient({
        clientName,
        redirectUris,
        grantTypes,
        scopes,
    }: {
        clientName: string;
        redirectUris: string[];
        grantTypes?: string[];
        scopes?: string[];
    }) {
        for (const uri of redirectUris) {
            try {
                // eslint-disable-next-line no-new
                new URL(uri);
            } catch {
                throw new ParameterError(`Invalid redirect URI ${uri}`);
            }
        }

        return this.oauthModel.createClient({
            clientName,
            redirectUris,
            grantTypes,
            scopes,
        });
    }

    public async listClients(user: SessionUser): Promise<OAuthClientSummary[]> {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            !user.organizationUuid ||
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage OAuth clients',
            );
        }
        return this.oauthModel.listClientsByOrganization(user.organizationUuid);
    }

    public async createAdminClient(
        user: SessionUser,
        {
            clientName,
            redirectUris,
        }: {
            clientName: string;
            redirectUris: string[];
        },
    ) {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            !user.organizationUuid ||
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage OAuth clients',
            );
        }
        // Validate redirect URIs
        for (const uri of redirectUris) {
            try {
                // eslint-disable-next-line no-new
                new URL(uri);
            } catch {
                throw new ParameterError(`Invalid redirect URI ${uri}`);
            }
        }

        return this.oauthModel.createClient({
            clientName,
            redirectUris,
            organizationUuid: user.organizationUuid,
            createdByUserUuid: user.userUuid,
        });
    }

    public async updateClient(
        user: SessionUser,
        clientId: string,
        {
            clientName,
            redirectUris,
        }: {
            clientName: string;
            redirectUris: string[];
        },
    ): Promise<OAuthClientSummary> {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            !user.organizationUuid ||
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage OAuth clients',
            );
        }
        // Validate redirect URIs
        for (const uri of redirectUris) {
            try {
                // eslint-disable-next-line no-new
                new URL(uri);
            } catch {
                throw new ParameterError(`Invalid redirect URI ${uri}`);
            }
        }

        const updated = await this.oauthModel.updateClient(
            clientId,
            user.organizationUuid,
            { clientName, redirectUris },
        );
        if (!updated) {
            throw new NotFoundError('OAuth client not found');
        }
        return updated;
    }

    public async deleteClient(
        user: SessionUser,
        clientId: string,
    ): Promise<void> {
        const auditedAbility = this.createAuditedAbility(user);
        if (
            !user.organizationUuid ||
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage OAuth clients',
            );
        }

        const deleted = await this.oauthModel.deleteClient(
            clientId,
            user.organizationUuid,
        );
        if (!deleted) {
            throw new NotFoundError('OAuth client not found');
        }
    }
}
