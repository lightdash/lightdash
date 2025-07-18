import { Knex } from 'knex';

export type DbOAuthAccessToken = {
    access_token_uuid: string;
    access_token: string;
    expires_at: Date;
    scopes: string[];
    user_uuid: string;
    organization_uuid: string;
    created_at: Date;
    last_used_at: Date | null;
    revoked_at: Date | null;
    authorization_code_uuid: string | null;
};

export type DbOAuthAccessTokenIn = Omit<
    DbOAuthAccessToken,
    'access_token_uuid' | 'created_at' | 'last_used_at' | 'revoked_at'
>;

export type DbOAuthAccessTokenUpdate = Partial<
    Pick<DbOAuthAccessToken, 'last_used_at' | 'revoked_at'>
>;

export type OAuthAccessTokenTable = Knex.CompositeTableType<
    DbOAuthAccessToken,
    DbOAuthAccessTokenIn,
    DbOAuthAccessTokenUpdate
>;

export const OAuthAccessTokenTableName = 'oauth_access_tokens';
