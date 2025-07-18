import { Knex } from 'knex';

export type DbOAuthRefreshToken = {
    refresh_token_uuid: string;
    refresh_token: string;
    expires_at: Date;
    scopes: string[];
    user_uuid: string;
    organization_uuid: string;
    created_at: Date;
    last_used_at: Date | null;
    revoked_at: Date | null;
    access_token_uuid: string;
};

export type DbOAuthRefreshTokenIn = Omit<
    DbOAuthRefreshToken,
    'refresh_token_uuid' | 'created_at' | 'last_used_at' | 'revoked_at'
>;

export type DbOAuthRefreshTokenUpdate = Partial<
    Pick<DbOAuthRefreshToken, 'last_used_at' | 'revoked_at'>
>;

export type OAuthRefreshTokenTable = Knex.CompositeTableType<
    DbOAuthRefreshToken,
    DbOAuthRefreshTokenIn,
    DbOAuthRefreshTokenUpdate
>;

export const OAuthRefreshTokenTableName = 'oauth_refresh_tokens';
