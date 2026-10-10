/* eslint-disable class-methods-use-this */
import {
    AuthorizationError,
    AuthTokenPrefix,
    TOKEN_EXCHANGE_GRANT_TYPE,
    UserWithOrganizationUuid,
    type AgentConnectionGrant,
    type LightdashUser,
    type OAuthClientSummary,
} from '@lightdash/common';
import OAuth2Server, {
    type AuthorizationCode,
    type AuthorizationCodeModel,
    type Client,
    type Token,
    type User,
} from '@node-oauth/oauth2-server';
import { Knex } from 'knex';
import { nanoid } from 'nanoid';
import { Scope } from 'oauth2-server';
import {
    agentConnectionGrantEnabled,
    matchesOAuthGrantBinding,
} from '../auth/agentConnectionGrants/oauthGrantBinding';
import {
    OAUTH_SCOPES,
    resolveOAuthScopeMode,
    scopesForOAuthRecord,
} from '../auth/oauthScopes/mode';
import { OAuthResourceBinding } from '../auth/oauthScopes/oauthResources';
import { OAuthTokenBinding } from '../auth/oauthScopes/oauthTokenBinding';
import { resolveOAuthSecurityStrict } from '../auth/oauthScopes/security';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import { AgentConnectionGrantModel } from './AgentConnectionGrantModel';
import { FeatureFlagModel } from './FeatureFlagModel/FeatureFlagModel';
import { matchesRegisteredRedirectUri } from './oauthRedirectUri';
import { matchesRedirectUriStrict } from './oauthStrictRedirectUri';

export const DEFAULT_OAUTH_CLIENT_ID = 'lightdash-cli';

export const MOBILE_OAUTH_REDIRECT_SCHEME = 'com.lightdash.mobile';

export const isMobileOAuthClient = (
    redirectUris: string[] | string | null | undefined,
): boolean => {
    if (redirectUris === null || redirectUris === undefined) return false;
    const uris = Array.isArray(redirectUris) ? redirectUris : [redirectUris];
    return uris.some((uri) =>
        uri.toLowerCase().startsWith(`${MOBILE_OAUTH_REDIRECT_SCHEME}:`),
    );
};

export class OAuth2Model implements AuthorizationCodeModel {
    constructor(
        private database: Knex,
        private lightdashConfig: LightdashConfig,
        private featureFlagModel: Pick<FeatureFlagModel, 'get'>,
    ) {}

    private getRefreshTokenLifetime(
        redirectUris: string[] | string | null | undefined,
    ): number | undefined {
        if (!isMobileOAuthClient(redirectUris)) return undefined;
        return this.lightdashConfig.auth.oauthServer
            ?.mobileRefreshTokenLifetime;
    }

    private static withTokenExchangeGrant(
        grants: string[] | null | undefined,
        redirectUris: string[] | string | null | undefined,
    ): string[] {
        const existing = grants ?? [];
        if (
            !isMobileOAuthClient(redirectUris) ||
            existing.includes(TOKEN_EXCHANGE_GRANT_TYPE)
        ) {
            return existing;
        }
        return [...existing, TOKEN_EXCHANGE_GRANT_TYPE];
    }

    private getRotationGraceMs(): number {
        return (
            (this.lightdashConfig.auth.oauthServer?.refreshTokenRotationGrace ??
                0) * 1000
        );
    }

    async getClient(
        clientId: string,
        clientSecret?: string | null,
    ): Promise<Client | false> {
        const query = this.database('oauth2_clients')
            .select('*')
            .where('client_id', clientId);

        if (clientSecret) {
            void query.andWhere('client_secret', clientSecret);
        }

        const client = await query.first();

        if (!client) {
            return false;
        }

        return {
            clientId: client.client_id,
            scopes: client.scopes ?? [],
            id: client.client_id,
            redirectUris: client.redirect_uris,
            grants: OAuth2Model.withTokenExchangeGrant(
                client.grants,
                client.redirect_uris,
            ),
            refreshTokenLifetime: this.getRefreshTokenLifetime(
                client.redirect_uris,
            ),
        };
    }

    async findClientName(clientId: string): Promise<string | undefined> {
        const client = await this.database('oauth2_clients')
            .select('client_name')
            .where('client_id', clientId)
            .first();
        return client?.client_name;
    }

    async saveAuthorizationCode(
        code: Pick<
            AuthorizationCode,
            | 'authorizationCode'
            | 'expiresAt'
            | 'redirectUri'
            | 'scope'
            | 'codeChallenge'
            | 'codeChallengeMethod'
        > &
            OAuthResourceBinding & { agentConnectionGrantUuid?: string | null },
        client: Client,
        user: UserWithOrganizationUuid,
    ): Promise<AuthorizationCode> {
        await this.database('oauth2_authorization_codes').insert({
            authorization_code: code.authorizationCode,
            expires_at: code.expiresAt,
            redirect_uri: code.redirectUri,
            scope: Array.isArray(code.scope)
                ? code.scope
                : [code.scope].filter(Boolean),
            client_id: client.id,
            user_id: user.userId,
            organization_uuid: user.organizationUuid,
            code_challenge: code.codeChallenge,
            code_challenge_method: code.codeChallengeMethod,
            resource: code.resource ?? null,
            agent_connection_grant_uuid: code.agentConnectionGrantUuid ?? null,
        });

        return {
            authorizationCode: code.authorizationCode,
            expiresAt: code.expiresAt,
            redirectUri: code.redirectUri,
            scope: code.scope,
            client,
            user,
            codeChallenge: code.codeChallenge,
            codeChallengeMethod: code.codeChallengeMethod,
            resource: code.resource ?? null,
            agentConnectionGrantUuid: code.agentConnectionGrantUuid ?? null,
        };
    }

    async getAuthorizationCode(
        authorizationCode: string,
    ): Promise<AuthorizationCode | false> {
        const result = await this.database('oauth2_authorization_codes')
            .select(
                'oauth2_authorization_codes.*',
                'oauth2_clients.client_id',
                'oauth2_clients.client_secret',
                'oauth2_clients.redirect_uris',
                'oauth2_clients.grants',
                'oauth2_clients.scopes',
                'oauth2_clients.client_name',
                'oauth2_authorization_codes.code_challenge',
                'oauth2_authorization_codes.code_challenge_method',
            )
            .leftJoin(
                'oauth2_clients',
                'oauth2_authorization_codes.client_id',
                'oauth2_clients.client_id',
            )
            .where(
                'oauth2_authorization_codes.authorization_code',
                authorizationCode,
            )
            .first();

        if (!result) {
            return false;
        }

        const grant =
            result.agent_connection_grant_uuid == null
                ? null
                : await this.getBoundGrant(
                      this.database,
                      {
                          agentConnectionGrantUuid:
                              result.agent_connection_grant_uuid,
                          resource: result.resource ?? null,
                          familyUuid: null,
                      },
                      { id: result.client_id },
                      {
                          userId: result.user_id,
                          organizationUuid: result.organization_uuid,
                      },
                      true,
                  );
        return {
            agentConnectionGrantUuid:
                result.agent_connection_grant_uuid ?? null,
            familyUuid: grant?.refreshFamilyUuid ?? null,
            authorizationCode: result.authorization_code,
            expiresAt: new Date(result.expires_at),
            redirectUri: result.redirect_uri,
            scope: result.scope,
            codeChallenge: result.code_challenge,
            codeChallengeMethod: result.code_challenge_method,
            resource: result.resource ?? null,
            client: {
                id: result.client_id,
                scopes: result.scopes ?? [],
                redirectUris: result.redirect_uris,
                grants: result.grants,
            },
            user: {
                userId: result.user_id,
                organizationUuid: result.organization_uuid,
            },
        };
    }

    async revokeAuthorizationCode(code: AuthorizationCode): Promise<boolean> {
        const result = await this.database('oauth2_authorization_codes')
            .where('authorization_code', code.authorizationCode)
            .del();

        return result > 0;
    }

    private async getBoundGrant(
        database: Knex,
        token: {
            agentConnectionGrantUuid: string;
            resource: string | null;
            familyUuid: string | null;
        },
        client: Pick<Client, 'id'>,
        user: UserWithOrganizationUuid,
        allowUnboundFamily = false,
    ): Promise<AgentConnectionGrant> {
        const storedUser = await database('users')
            .select('user_uuid')
            .where('user_id', user.userId)
            .first();
        const grant = await new AgentConnectionGrantModel({
            database,
        }).findActive(token.agentConnectionGrantUuid, new Date());
        if (
            !storedUser ||
            !grant ||
            !(await agentConnectionGrantEnabled(this.featureFlagModel, {
                userUuid: storedUser.user_uuid,
                organizationUuid: user.organizationUuid,
            })) ||
            !matchesOAuthGrantBinding(grant, {
                subjectUserUuid: storedUser.user_uuid,
                organizationUuid: user.organizationUuid,
                clientId: client.id,
                resource: token.resource,
                familyUuid:
                    allowUnboundFamily &&
                    (grant.refreshFamilyUuid === null ||
                        token.familyUuid === null)
                        ? grant.refreshFamilyUuid
                        : token.familyUuid,
            })
        )
            throw new OAuth2Server.InvalidGrantError(
                'Agent connection grant is invalid',
            );
        return grant;
    }

    private async lockRefreshRotation(
        database: Knex,
        userId: number,
    ): Promise<void> {
        await database.raw(
            "SELECT pg_advisory_xact_lock(hashtext('oauth_refresh_rotation'), ?)",
            [userId],
        );
    }

    private async revokeRefreshFamily(
        database: Knex,
        token: Token,
        familyUuid: string | null,
        reason: 'reused' | 'race',
    ): Promise<void> {
        if (token.agentConnectionGrantUuid != null) {
            await new AgentConnectionGrantModel({ database }).revoke({
                grantUuid: token.agentConnectionGrantUuid,
                organizationUuid: token.user.organizationUuid,
                revokedByUserUuid: null,
                reason: 'refresh_reuse',
            });
        }
        if (familyUuid === null) return;
        await database('oauth2_refresh_tokens')
            .where('family_uuid', familyUuid)
            .update({
                revoked_at: database.raw('coalesce(revoked_at, now())'),
            });
        await database('oauth2_access_tokens')
            .where('family_uuid', familyUuid)
            .del();
        Logger.warn('oauth_refresh_token_reuse', {
            clientId: token.client.id,
            userUuid: token.user.userUuid ?? null,
            familyUuid,
            reason,
        });
    }

    private async consumeRefreshToken(
        database: Knex,
        token: Token,
        familyUuid: string | null,
    ): Promise<boolean> {
        const consumed = await database('oauth2_refresh_tokens')
            .whereNull('revoked_at')
            .where('refresh_token', token.refreshToken)
            .update({
                revoked_at: database.fn.now(),
                ...(familyUuid === null
                    ? {}
                    : {
                          family_uuid: database.raw(
                              'coalesce(family_uuid, ?)',
                              [familyUuid],
                          ),
                      }),
            });
        if (consumed > 0) return true;
        const parent = await database('oauth2_refresh_tokens')
            .select(
                'family_uuid',
                'agent_connection_grant_uuid',
                'organization_uuid',
            )
            .where('refresh_token', token.refreshToken)
            .first();
        await this.revokeRefreshFamily(
            database,
            {
                ...token,
                agentConnectionGrantUuid:
                    parent?.agent_connection_grant_uuid ?? null,
                user: {
                    ...token.user,
                    organizationUuid:
                        parent?.organization_uuid ??
                        token.user.organizationUuid,
                },
            },
            parent?.family_uuid ?? null,
            'race',
        );
        return false;
    }

    async saveToken(
        token: Token & Partial<OAuthTokenBinding>,
        client: Client,
        user: UserWithOrganizationUuid,
    ): Promise<Token> {
        const { parentRefreshToken = null, ...issued } = token;
        if (parentRefreshToken === null) {
            if (issued.agentConnectionGrantUuid != null)
                return this.database.transaction((database) =>
                    this.persistToken(database, issued, client, user),
                );
            return this.persistToken(this.database, issued, client, user);
        }
        const saved = await this.database.transaction(async (database) => {
            await this.lockRefreshRotation(database, user.userId);
            if (issued.agentConnectionGrantUuid != null) {
                const stored = await database('oauth2_refresh_tokens')
                    .where('refresh_token', parentRefreshToken)
                    .forUpdate()
                    .first();
                if (
                    !stored ||
                    stored.agent_connection_grant_uuid !==
                        issued.agentConnectionGrantUuid ||
                    stored.family_uuid !== issued.familyUuid ||
                    stored.resource !== issued.resource ||
                    stored.client_id !== client.id ||
                    stored.user_id !== user.userId ||
                    stored.organization_uuid !== user.organizationUuid
                )
                    throw new OAuth2Server.InvalidGrantError(
                        'Agent connection refresh binding is invalid',
                    );
                const scopes = issued.scope ?? [];
                if (
                    scopes.length !== stored.scope.length ||
                    scopes.some((scope) => !stored.scope.includes(scope))
                )
                    throw new OAuth2Server.InvalidScopeError(
                        'Agent connection scopes cannot change',
                    );
            }
            const parent = {
                ...issued,
                refreshToken: parentRefreshToken,
                client,
                user,
            };
            if (
                !(await this.consumeRefreshToken(
                    database,
                    parent,
                    issued.familyUuid ?? null,
                ))
            )
                return null;
            return this.persistToken(database, issued, client, user);
        });
        if (saved === null)
            throw new OAuth2Server.InvalidGrantError(
                'Refresh token is already used',
            );
        return saved;
    }

    private async persistToken(
        database: Knex,
        token: Token,
        client: Client,
        user: UserWithOrganizationUuid,
    ): Promise<Token> {
        let issued = token;
        if (token.agentConnectionGrantUuid != null) {
            const grant = await this.getBoundGrant(
                database,
                {
                    agentConnectionGrantUuid: token.agentConnectionGrantUuid,
                    resource: token.resource ?? null,
                    familyUuid: token.familyUuid ?? null,
                },
                client,
                user,
                true,
            );
            if (!token.familyUuid)
                throw new OAuth2Server.InvalidGrantError(
                    'Agent connection refresh family is missing',
                );
            await new AgentConnectionGrantModel({ database }).bindRefreshFamily(
                {
                    grantUuid: grant.grantUuid,
                    organizationUuid: grant.organizationUuid,
                    familyUuid: token.familyUuid,
                },
            );
            const clip = (expiry: Date | undefined) =>
                new Date(
                    Math.min(
                        expiry?.getTime() ?? Infinity,
                        grant.expiresAt.getTime(),
                    ),
                );
            issued = {
                ...token,
                accessTokenExpiresAt: clip(token.accessTokenExpiresAt),
                refreshTokenExpiresAt: clip(token.refreshTokenExpiresAt),
            };
        }
        await database('oauth2_access_tokens').insert({
            access_token: issued.accessToken,
            resource: issued.resource ?? null,
            family_uuid: issued.familyUuid ?? null,
            agent_connection_grant_uuid:
                issued.agentConnectionGrantUuid ?? null,
            expires_at: issued.accessTokenExpiresAt,
            scope: Array.isArray(issued.scope)
                ? issued.scope
                : [issued.scope].filter(Boolean),
            client_id: client.id,
            user_id: user.userId,
            organization_uuid: user.organizationUuid,
        });

        if (issued.refreshToken) {
            await database('oauth2_refresh_tokens').insert({
                refresh_token: issued.refreshToken,
                resource: issued.resource ?? null,
                family_uuid: issued.familyUuid ?? null,
                agent_connection_grant_uuid:
                    issued.agentConnectionGrantUuid ?? null,
                expires_at: issued.refreshTokenExpiresAt,
                scope: Array.isArray(issued.scope)
                    ? issued.scope
                    : [issued.scope].filter(Boolean),
                client_id: client.id,
                user_id: user.userId,
                organization_uuid: user.organizationUuid,
            });

            await database('oauth2_refresh_tokens')
                .where('user_id', user.userId)
                .where((query) => {
                    if (
                        issued.familyUuid !== null &&
                        issued.familyUuid !== undefined
                    ) {
                        void query
                            .where((legacy) =>
                                legacy
                                    .whereNull('family_uuid')
                                    .where((expired) =>
                                        expired
                                            .where(
                                                'expires_at',
                                                '<',
                                                database.fn.now(),
                                            )
                                            .orWhere(
                                                'revoked_at',
                                                '<',
                                                database.raw(
                                                    "now() - interval '1 day'",
                                                ),
                                            ),
                                    ),
                            )
                            .orWhere((family) =>
                                family
                                    .whereNotNull('family_uuid')
                                    .whereNotExists(
                                        database(
                                            'oauth2_refresh_tokens as live',
                                        )
                                            .select(database.raw('1'))
                                            .where(
                                                'live.family_uuid',
                                                database.ref(
                                                    'oauth2_refresh_tokens.family_uuid',
                                                ),
                                            )
                                            .where(
                                                'live.expires_at',
                                                '>=',
                                                database.fn.now(),
                                            ),
                                    ),
                            );
                    } else {
                        void query
                            .where('expires_at', '<', database.fn.now())
                            .orWhere(
                                'revoked_at',
                                '<',
                                database.raw("now() - interval '1 day'"),
                            );
                    }
                })
                .del();
        }

        return { ...issued, client, user };
    }

    async getAccessToken(accessToken: string): Promise<Token | false> {
        const result = await this.database('oauth2_access_tokens')
            .select(
                'oauth2_access_tokens.*',
                'oauth2_clients.client_id',
                'oauth2_clients.client_secret',
                'oauth2_clients.redirect_uris',
                'oauth2_clients.grants',
                'oauth2_clients.scopes',
                'oauth2_clients.client_name',
                'users.user_uuid',
            )
            .leftJoin(
                'oauth2_clients',
                'oauth2_access_tokens.client_id',
                'oauth2_clients.client_id',
            )
            .leftJoin('users', 'oauth2_access_tokens.user_id', 'users.user_id')
            .where('oauth2_access_tokens.access_token', accessToken)
            .first();

        if (!result) {
            return false;
        }

        return {
            accessToken: result.access_token,
            familyUuid: result.family_uuid ?? null,
            agentConnectionGrantUuid:
                result.agent_connection_grant_uuid ?? null,
            resource: result.resource ?? null,
            accessTokenExpiresAt: new Date(result.expires_at),
            scope: result.scope,
            client: {
                id: result.client_id,
                scopes: result.scopes ?? [],
                redirectUris: result.redirect_uris,
                grants: result.grants,
            },
            user: {
                userId: result.user_id,
                userUuid: result.user_uuid,
                organizationUuid: result.organization_uuid,
            },
        };
    }

    async revokeToken(token: Token): Promise<boolean> {
        if (!token.refreshToken) {
            return false;
        }

        if (
            await this.isSecurityStrictForOAuthUser(
                token.user as UserWithOrganizationUuid,
            )
        ) {
            return this.database.transaction(async (database) => {
                await this.lockRefreshRotation(database, token.user.userId);
                return this.consumeRefreshToken(database, token, null);
            });
        }

        const result = await this.database('oauth2_refresh_tokens')
            .where('refresh_token', token.refreshToken)
            .update({
                revoked_at: this.database.raw('coalesce(revoked_at, now())'),
            });

        return result > 0;
    }

    async deleteRefreshToken(refreshToken: string): Promise<boolean> {
        const result = await this.database('oauth2_refresh_tokens')
            .where('refresh_token', refreshToken)
            .del();

        return result > 0;
    }

    async deleteAccessToken(accessToken: string): Promise<boolean> {
        const result = await this.database('oauth2_access_tokens')
            .where('access_token', accessToken)
            .del();

        return result > 0;
    }

    async getRefreshToken(refreshToken: string): Promise<Token | false> {
        const result = await this.database('oauth2_refresh_tokens')
            .select(
                'oauth2_refresh_tokens.*',
                'oauth2_clients.client_id',
                'oauth2_clients.client_secret',
                'oauth2_clients.redirect_uris',
                'oauth2_clients.grants',
                'oauth2_clients.scopes',
                'oauth2_clients.client_name',
            )
            .leftJoin(
                'oauth2_clients',
                'oauth2_refresh_tokens.client_id',
                'oauth2_clients.client_id',
            )
            .where('oauth2_refresh_tokens.refresh_token', refreshToken)
            .first();

        if (!result) {
            return false;
        }

        const token: Token = {
            accessToken: '',
            refreshToken: result.refresh_token,
            resource: result.resource ?? null,
            familyUuid: result.family_uuid ?? null,
            agentConnectionGrantUuid:
                result.agent_connection_grant_uuid ?? null,
            refreshTokenExpiresAt: new Date(result.expires_at),
            scope: result.scope,
            client: {
                id: result.client_id,
                scopes: result.scopes ?? [],
                redirectUris: result.redirect_uris,
                grants: result.grants,
                refreshTokenLifetime: this.getRefreshTokenLifetime(
                    result.redirect_uris,
                ),
            },
            user: {
                userId: result.user_id,
                organizationUuid: result.organization_uuid,
            },
        };
        const strict =
            token.agentConnectionGrantUuid != null ||
            (await this.isSecurityStrictForOAuthUser(
                token.user as UserWithOrganizationUuid,
            ));
        if (
            strict &&
            result.revoked_at !== null &&
            result.revoked_at !== undefined
        ) {
            if (token.familyUuid !== null) {
                await this.database.transaction(async (database) => {
                    await this.lockRefreshRotation(database, token.user.userId);
                    await this.revokeRefreshFamily(
                        database,
                        token,
                        token.familyUuid,
                        'reused',
                    );
                });
            }
            return false;
        }
        if (
            result.revoked_at !== null &&
            result.revoked_at !== undefined &&
            Date.now() - new Date(result.revoked_at).getTime() >
                this.getRotationGraceMs()
        ) {
            return false;
        }

        if (token.agentConnectionGrantUuid != null) {
            const grant = await this.getBoundGrant(
                this.database,
                {
                    agentConnectionGrantUuid: token.agentConnectionGrantUuid,
                    resource: token.resource ?? null,
                    familyUuid: token.familyUuid ?? null,
                },
                token.client,
                token.user as UserWithOrganizationUuid,
            );
            if (!token.familyUuid)
                throw new OAuth2Server.InvalidGrantError(
                    'Agent connection refresh family is missing',
                );
            token.refreshTokenExpiresAt = new Date(
                Math.min(
                    token.refreshTokenExpiresAt!.getTime(),
                    grant.expiresAt.getTime(),
                ),
            );
        }
        return token;
    }

    async generateAccessToken(
        client: Client,
        user: User,
        scope: Scope,
    ): Promise<string> {
        return `${AuthTokenPrefix.OAUTH_APP}${nanoid(64)}`;
    }

    async generateRefreshToken(
        client: Client,
        user: User,
        scope: Scope,
    ): Promise<string> {
        return `${AuthTokenPrefix.OAUTH_REFRESH}${nanoid(64)}`;
    }

    async getScopeMode(user: UserWithOrganizationUuid) {
        const storedUser = await this.database('users')
            .select('user_uuid')
            .where('user_id', user.userId)
            .first();
        if (!storedUser) {
            throw new AuthorizationError('OAuth user not found');
        }
        return resolveOAuthScopeMode(this.featureFlagModel, {
            organizationUuid: user.organizationUuid,
            userUuid: storedUser.user_uuid,
        });
    }

    async isSecurityStrict(
        user: Pick<LightdashUser, 'userUuid' | 'organizationUuid'> | null,
    ): Promise<boolean> {
        return resolveOAuthSecurityStrict(this.featureFlagModel, user);
    }

    async isSecurityStrictForOAuthUser(
        user: UserWithOrganizationUuid,
    ): Promise<boolean> {
        const storedUser = await this.database('users')
            .select('user_uuid')
            .where('user_id', user.userId)
            .first();
        if (!storedUser) throw new AuthorizationError('OAuth user not found');
        return this.isSecurityStrict({
            userUuid: storedUser.user_uuid,
            organizationUuid: user.organizationUuid,
        });
    }

    async validateScope(
        user: UserWithOrganizationUuid,
        client: Client,
        scope: string[] = [],
    ): Promise<string[] | false> {
        const mode = await this.getScopeMode(user);
        if (mode === null) return scope;

        const registeredScopes: string[] = client.scopes ?? [];
        const allowedScopes = new Set<string>(
            OAUTH_SCOPES.filter(
                (knownScope) =>
                    registeredScopes.length === 0 ||
                    registeredScopes.includes(knownScope),
            ),
        );
        if (
            scope.every((requestedScope) => allowedScopes.has(requestedScope))
        ) {
            return scope;
        }

        Logger.warn('oauth_scope_refusal', {
            mode,
            clientId: client.id,
            scopes: scopesForOAuthRecord(scope),
            method: null,
            routeTemplate: null,
            toolName: null,
            action: 'validateScope',
            subjectType: 'OAuthClient',
        });
        return mode === 'enforce' ? false : scope;
    }

    async validateRedirectUri(
        redirectUri: string,
        client: Client,
    ): Promise<boolean> {
        return (
            Array.isArray(client.redirectUris) &&
            client.redirectUris.some((uri) =>
                matchesRegisteredRedirectUri(redirectUri, uri),
            )
        );
    }

    async validateRedirectUriStrict(
        redirectUri: string,
        client: Client,
    ): Promise<boolean> {
        return (
            Array.isArray(client.redirectUris) &&
            client.redirectUris.some((uri) =>
                matchesRedirectUriStrict(redirectUri, uri),
            )
        );
    }

    async createClient({
        clientName,
        redirectUris,
        grantTypes = ['authorization_code', 'refresh_token'],
        scopes = [],
        clientSecret,
        organizationUuid,
        createdByUserUuid,
    }: {
        clientName: string;
        redirectUris: string[];
        grantTypes?: string[];
        scopes?: string[];
        clientSecret?: string;
        organizationUuid?: string;
        createdByUserUuid?: string;
    }): Promise<{
        clientId: string;
        clientSecret?: string;
        clientName: string;
        redirectUris: string[];
        grantTypes: string[];
        scopes: string[];
        createdAt: Date;
    }> {
        const clientId = organizationUuid
            ? `oauth-${nanoid(16)}`
            : `mcp-${nanoid(16)}`;
        const generatedClientSecret = clientSecret || nanoid(32);

        const [client] = await this.database('oauth2_clients')
            .insert({
                client_id: clientId,
                client_secret: generatedClientSecret,
                redirect_uris: redirectUris,
                grants: grantTypes,
                scopes,
                client_name: clientName,
                organization_uuid: organizationUuid || null,
                created_by_user_uuid: createdByUserUuid || null,
            })
            .returning('*');

        return {
            clientId: client.client_id,
            clientSecret: client.client_secret,
            clientName: client.client_name,
            redirectUris: client.redirect_uris,
            grantTypes: client.grants,
            scopes: client.scopes,
            createdAt: client.created_at,
        };
    }

    async listClientsByOrganization(
        organizationUuid: string,
    ): Promise<OAuthClientSummary[]> {
        const clients = await this.database('oauth2_clients')
            .select('*')
            .where('organization_uuid', organizationUuid)
            .orderBy('created_at', 'desc');

        return clients.map((client) => ({
            clientId: client.client_id,
            clientName: client.client_name,
            redirectUris: client.redirect_uris,
            scopes: client.scopes || [],
            createdAt: client.created_at,
            createdByUserUuid: client.created_by_user_uuid,
        }));
    }

    async updateClient(
        clientId: string,
        organizationUuid: string | null,
        {
            clientName,
            redirectUris,
        }: {
            clientName: string;
            redirectUris: string[];
        },
    ): Promise<OAuthClientSummary | null> {
        let query = this.database('oauth2_clients').where(
            'client_id',
            clientId,
        );

        if (organizationUuid === null) {
            query = query.whereNull('organization_uuid');
        } else {
            query = query.andWhere('organization_uuid', organizationUuid);
        }

        const [updated] = await query
            .update({
                client_name: clientName,
                redirect_uris: redirectUris,
            })
            .returning('*');

        if (!updated) return null;

        return {
            clientId: updated.client_id,
            clientName: updated.client_name,
            redirectUris: updated.redirect_uris,
            scopes: updated.scopes || [],
            createdAt: updated.created_at,
            createdByUserUuid: updated.created_by_user_uuid,
        };
    }

    async deleteClient(
        clientId: string,
        organizationUuid: string | null,
    ): Promise<boolean> {
        let query = this.database('oauth2_clients').where(
            'client_id',
            clientId,
        );

        if (organizationUuid === null) {
            query = query.whereNull('organization_uuid');
        } else {
            query = query.andWhere('organization_uuid', organizationUuid);
        }

        const result = await query.del();

        return result > 0;
    }
}
