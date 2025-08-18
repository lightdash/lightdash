/* eslint-disable class-methods-use-this */
import { AuthTokenPrefix, UserWithOrganizationUuid } from '@lightdash/common';
import type {
    AuthorizationCode,
    AuthorizationCodeModel,
    Client,
    Token,
    User,
} from '@node-oauth/oauth2-server';
import { Knex } from 'knex';
import { nanoid } from 'nanoid';
import { Scope } from 'oauth2-server';

export const DEFAULT_OAUTH_CLIENT_ID = 'lightdash-cli';

export class OAuth2Model implements AuthorizationCodeModel {
    constructor(private database: Knex) {}

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
            id: client.client_id,
            redirectUris: client.redirect_uris,
            grants: client.grants,
        };
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
        >,
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

        return {
            authorizationCode: result.authorization_code,
            expiresAt: new Date(result.expires_at),
            redirectUri: result.redirect_uri,
            scope: result.scope,
            codeChallenge: result.code_challenge,
            codeChallengeMethod: result.code_challenge_method,
            client: {
                id: result.client_id,
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

    async saveToken(
        token: Token,
        client: Client,
        user: UserWithOrganizationUuid,
    ): Promise<Token> {
        await this.database('oauth2_access_tokens').insert({
            access_token: token.accessToken,
            expires_at: token.accessTokenExpiresAt,
            scope: Array.isArray(token.scope)
                ? token.scope
                : [token.scope].filter(Boolean),
            client_id: client.id,
            user_id: user.userId,
            organization_uuid: user.organizationUuid,
        });

        if (token.refreshToken) {
            await this.database('oauth2_refresh_tokens').insert({
                refresh_token: token.refreshToken,
                expires_at: token.refreshTokenExpiresAt,
                scope: Array.isArray(token.scope)
                    ? token.scope
                    : [token.scope].filter(Boolean),
                client_id: client.id,
                user_id: user.userId,
                organization_uuid: user.organizationUuid,
            });
        }

        return { ...token, client, user };
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
            accessTokenExpiresAt: new Date(result.expires_at),
            scope: result.scope,
            client: {
                id: result.client_id,
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

        const result = await this.database('oauth2_refresh_tokens')
            .where('refresh_token', token.refreshToken)
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

        return {
            accessToken: '',
            refreshToken: result.refresh_token,
            refreshTokenExpiresAt: new Date(result.expires_at),
            scope: result.scope,
            client: {
                id: result.client_id,
                redirectUris: result.redirect_uris,
                grants: result.grants,
            },
            user: {
                userId: result.user_id,
                organizationUuid: result.organization_uuid,
            },
        };
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

    async validateRedirectUri(
        redirectUri: string,
        client: Client,
    ): Promise<boolean> {
        const escapeRegExp = (string: string) =>
            string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const wildcardToRegExp = (wildcard: string) =>
            new RegExp(`^${escapeRegExp(wildcard).replace(/\\\*/g, '.*')}$`);

        if (!client.redirectUris) {
            return false;
        }

        const isValidRedirectUri =
            Array.isArray(client.redirectUris) &&
            client.redirectUris.some((uri) => {
                const regex = wildcardToRegExp(uri);
                return regex.test(redirectUri);
            });

        if (isValidRedirectUri) {
            return true;
        }

        return false;
    }

    async createClient({
        clientName,
        redirectUris,
        grantTypes = ['authorization_code', 'refresh_token'],
        scopes = [],
        clientSecret,
    }: {
        clientName: string;
        redirectUris: string[];
        grantTypes?: string[];
        scopes?: string[];
        clientSecret?: string;
        organizationUuid?: string;
    }): Promise<{
        clientId: string;
        clientSecret?: string;
        clientName: string;
        redirectUris: string[];
        grantTypes: string[];
        scopes: string[];
        createdAt: Date;
    }> {
        const clientId = `mcp-${nanoid(16)}`;
        const generatedClientSecret = clientSecret || nanoid(32);

        const [client] = await this.database('oauth2_clients')
            .insert({
                client_id: clientId,
                client_secret: generatedClientSecret,
                redirect_uris: redirectUris,
                grants: grantTypes,
                scopes,
                client_name: clientName,
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

    // Optional not implemented methods
    // We will be using the default implementation from the oauth2-server library

    // async generateAuthorizationCode(client: Client,user: User,scope: Scope,): Promise<string>
    // async verifyScope(token: Token, scope: Scope): Promise<boolean>
}
