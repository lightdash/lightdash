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
import { assertOAuthCredentialOperationAllowed } from '../../auth/oauthScopes/credentials';
import {
    oauthApiResource,
    requestedOAuthResource,
} from '../../auth/oauthScopes/oauthResources';
import { OAuthBearerRefusalError } from '../../auth/oauthScopes/security';
import { LightdashConfig } from '../../config/parseConfig';
import { OAuth2Model } from '../../models/OAuth2Model';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';
import type { ManagedSignInService } from './managedSignIn/ManagedSignInService';
import { createMicrosoftTokenExchangeGrantType } from './managedSignIn/microsoftTokenExchangeGrantType';
import { createResourceBoundAuthorizationCodeGrant } from './ResourceBoundAuthorizationCodeGrant';
import { createScopeCheckedRefreshTokenGrant } from './ScopeCheckedRefreshTokenGrant';

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
            extendedGrantTypes: {
                authorization_code: createResourceBoundAuthorizationCodeGrant(
                    (user) =>
                        this.oauthModel.isSecurityStrict(
                            user as UserWithOrganizationUuid,
                        ),
                    this.getSiteUrl(),
                ) as unknown as typeof OAuth2Server.AbstractGrantType,
                refresh_token: createScopeCheckedRefreshTokenGrant(
                    (user) =>
                        this.oauthModel.getScopeMode(
                            user as UserWithOrganizationUuid,
                        ),
                    (user) =>
                        this.oauthModel.isSecurityStrict(
                            user as UserWithOrganizationUuid,
                        ),
                    this.getSiteUrl(),
                ) as unknown as typeof OAuth2Server.AbstractGrantType,
                ...(getManagedSignInService
                    ? {
                          [TOKEN_EXCHANGE_GRANT_TYPE]:
                              createMicrosoftTokenExchangeGrantType(
                                  getManagedSignInService,
                                  (user) =>
                                      this.oauthModel.isSecurityStrict(
                                          user as UserWithOrganizationUuid,
                                      ),
                                  this.getSiteUrl(),
                              ),
                      }
                    : {}),
            },
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
        const resource = await this.getAuthorizationResource(request, user);
        const model: OAuth2Server.AuthorizationCodeModel = Object.create(
            this.oauthModel,
        ) as OAuth2Server.AuthorizationCodeModel;
        model.saveAuthorizationCode = (code, client, savedUser) =>
            this.oauthModel.saveAuthorizationCode(
                { ...code, resource },
                client,
                savedUser as UserWithOrganizationUuid,
            );
        const options = {
            model,
            authenticateHandler: {
                handle: () => user,
            },
        };
        return this.oauthServer.authorize(request, response, options);
    }

    public async getAuthorizationResource(
        request: OAuth2Server.Request,
        user: UserWithOrganizationUuid,
    ): Promise<string | null> {
        const strict = await this.isSecurityStrict(user);
        if (
            strict &&
            !(request.body.code_challenge || request.query?.code_challenge)
        ) {
            throw new OAuth2Server.InvalidRequestError(
                'Missing parameter: `code_challenge`',
            );
        }
        const method =
            request.body?.code_challenge_method ||
            request.query?.code_challenge_method;
        if (strict && method && method !== 'S256')
            throw new OAuth2Server.InvalidRequestError(
                'Invalid parameter: `code_challenge_method`',
            );
        return strict
            ? (requestedOAuthResource(this.getSiteUrl(), {
                  body: request.body ?? {},
                  query: request.query ?? null,
              }) ?? oauthApiResource(this.getSiteUrl()))
            : null;
    }

    public isSecurityStrict(
        user: UserWithOrganizationUuid | null,
    ): Promise<boolean> {
        return this.oauthModel.isSecurityStrict(user);
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
        if (request.query?.access_token !== undefined) {
            const queryToken = request.query.access_token;
            const headerToken =
                /^Bearer\s+(\S+)$/i.exec(
                    request.get('authorization') ?? '',
                )?.[1] ?? null;
            const candidates = new Set(
                [queryToken, headerToken].filter(
                    (token): token is string => typeof token === 'string',
                ),
            );
            const refusals = await Promise.all(
                [...candidates].map(async (candidate) => {
                    const token =
                        await this.oauthModel.getAccessToken(candidate);
                    return token
                        ? this.isSecurityStrict(
                              token.user as UserWithOrganizationUuid,
                          )
                        : false;
                }),
            );
            if (refusals.some(Boolean)) throw new OAuthBearerRefusalError();
        }
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
        assertOAuthCredentialOperationAllowed(account, 'createOAuthClient');
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
        assertOAuthCredentialOperationAllowed(account, 'updateOAuthClient');
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
        assertOAuthCredentialOperationAllowed(account, 'deleteOAuthClient');
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
