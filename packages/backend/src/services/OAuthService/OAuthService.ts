import { subject } from '@casl/ability';
import {
    ForbiddenError,
    getClientName,
    isSafeRedirectScheme,
    NotFoundError,
    ParameterError,
    TOKEN_EXCHANGE_GRANT_TYPE,
    UserWithOrganizationUuid,
    type Account,
    type OAuthClientSummary,
} from '@lightdash/common';
import OAuth2Server from '@node-oauth/oauth2-server';
import { LightdashConfig } from '../../config/parseConfig';
import { OAuth2Model } from '../../models/OAuth2Model';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';
import type { ManagedSignInService } from './managedSignIn/ManagedSignInService';
import { createMicrosoftTokenExchangeGrantType } from './managedSignIn/microsoftTokenExchangeGrantType';

export enum OAuthScope {
    READ = 'read',
    WRITE = 'write',
    MCP_READ = 'mcp:read',
    MCP_WRITE = 'mcp:write',
}

export type OAuthGrantRevokedHandler = (args: {
    userId: number;
    clientId: string;
}) => Promise<void>;

type OAuthServiceArguments = {
    userModel: UserModel;
    oauthModel: OAuth2Model;
    lightdashConfig: LightdashConfig;
    onGrantRevoked?: OAuthGrantRevokedHandler;
    getManagedSignInService?: () => ManagedSignInService;
};

export class OAuthService extends BaseService {
    protected oauthServer!: OAuth2Server;

    private userModel: UserModel;

    private oauthModel: OAuth2Model;

    private lightdashConfig: LightdashConfig;

    private onGrantRevoked: OAuthGrantRevokedHandler | undefined;

    private getManagedSignInService: (() => ManagedSignInService) | undefined;

    constructor({
        userModel,
        oauthModel,
        lightdashConfig,
        onGrantRevoked,
        getManagedSignInService,
    }: OAuthServiceArguments) {
        super();
        this.userModel = userModel;
        this.oauthModel = oauthModel;
        this.lightdashConfig = lightdashConfig;
        this.onGrantRevoked = onGrantRevoked;
        this.getManagedSignInService = getManagedSignInService;
        this.initializeOAuthServer();
    }

    private initializeOAuthServer(): void {
        const { getManagedSignInService } = this;
        this.oauthServer = new OAuth2Server({
            model: this.oauthModel,
            extendedGrantTypes: getManagedSignInService
                ? {
                      [TOKEN_EXCHANGE_GRANT_TYPE]:
                          createMicrosoftTokenExchangeGrantType(
                              getManagedSignInService,
                          ),
                  }
                : undefined,
            allowBearerTokensInQueryString: true,
            allowEmptyState: true, // Make state parameter optional for MCP compatibility
            accessTokenLifetime:
                this.lightdashConfig.auth.oauthServer?.accessTokenLifetime,
            refreshTokenLifetime:
                this.lightdashConfig.auth.oauthServer?.refreshTokenLifetime,
            // Allow public clients (no client authentication required for refresh tokens)
            requireClientAuthentication: {
                refresh_token: false, // Don't require for refresh token (public client)
                [TOKEN_EXCHANGE_GRANT_TYPE]: false,
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

    public async validateRedirectUri(
        clientId: string,
        redirectUri: string,
    ): Promise<boolean> {
        const client = await this.oauthModel.getClient(clientId);
        return (
            client !== false &&
            this.oauthModel.validateRedirectUri(redirectUri, client)
        );
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
        const refreshToken = await this.oauthModel.getRefreshToken(token);
        if (refreshToken) {
            const deleted = await this.oauthModel.deleteRefreshToken(token);
            const { userId } = refreshToken.user as UserWithOrganizationUuid;
            if (deleted && this.onGrantRevoked !== undefined) {
                await this.onGrantRevoked({
                    userId,
                    clientId: refreshToken.client.id,
                });
            }
            return deleted;
        }
        return this.oauthModel.deleteAccessToken(token);
    }

    public async getClientDisplayName(clientId: string): Promise<string> {
        const clientName = await this.oauthModel.findClientName(clientId);
        return clientName ?? getClientName(clientId);
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
            if (!isSafeRedirectScheme(uri)) {
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

    public async listClients(account: Account): Promise<OAuthClientSummary[]> {
        const auditedAbility = this.createAuditedAbility(account);
        if (
            !account.organization.organizationUuid ||
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: account.organization.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage OAuth clients',
            );
        }
        return this.oauthModel.listClientsByOrganization(
            account.organization.organizationUuid,
        );
    }

    public async createAdminClient(
        account: Account,
        {
            clientName,
            redirectUris,
        }: {
            clientName: string;
            redirectUris: string[];
        },
    ) {
        const auditedAbility = this.createAuditedAbility(account);
        if (
            !account.organization.organizationUuid ||
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: account.organization.organizationUuid,
                    metadata: { clientName },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage OAuth clients',
            );
        }
        // Validate redirect URIs
        for (const uri of redirectUris) {
            if (!isSafeRedirectScheme(uri)) {
                throw new ParameterError(`Invalid redirect URI ${uri}`);
            }
        }

        return this.oauthModel.createClient({
            clientName,
            redirectUris,
            organizationUuid: account.organization.organizationUuid,
            createdByUserUuid: account.user.id,
        });
    }

    public async updateClient(
        account: Account,
        clientId: string,
        {
            clientName,
            redirectUris,
        }: {
            clientName: string;
            redirectUris: string[];
        },
    ): Promise<OAuthClientSummary> {
        const auditedAbility = this.createAuditedAbility(account);
        if (
            !account.organization.organizationUuid ||
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: account.organization.organizationUuid,
                    metadata: { clientId },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage OAuth clients',
            );
        }
        // Validate redirect URIs
        for (const uri of redirectUris) {
            if (!isSafeRedirectScheme(uri)) {
                throw new ParameterError(`Invalid redirect URI ${uri}`);
            }
        }

        const updated = await this.oauthModel.updateClient(
            clientId,
            account.organization.organizationUuid,
            { clientName, redirectUris },
        );
        if (!updated) {
            throw new NotFoundError('OAuth client not found');
        }
        return updated;
    }

    public async deleteClient(
        account: Account,
        clientId: string,
    ): Promise<void> {
        const auditedAbility = this.createAuditedAbility(account);
        if (
            !account.organization.organizationUuid ||
            auditedAbility.cannot(
                'manage',
                subject('Organization', {
                    organizationUuid: account.organization.organizationUuid,
                    metadata: { clientId },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage OAuth clients',
            );
        }

        const deleted = await this.oauthModel.deleteClient(
            clientId,
            account.organization.organizationUuid,
        );
        if (!deleted) {
            throw new NotFoundError('OAuth client not found');
        }
    }
}
