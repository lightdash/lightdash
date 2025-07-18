import { Knex } from 'knex';

export type DbOAuthAuthorizationCode = {
    authorization_code_uuid: string;
    authorization_code: string;
    expires_at: Date;
    redirect_uri: string;
    scopes: string[];
    user_uuid: string;
    organization_uuid: string;
    created_at: Date;
    used_at: Date | null;
    code_challenge: string | null;
    code_challenge_method: 'S256' | 'plain' | null;
};

export type DbOAuthAuthorizationCodeIn = Omit<
    DbOAuthAuthorizationCode,
    'authorization_code_uuid' | 'created_at' | 'used_at'
>;

export type DbOAuthAuthorizationCodeUpdate = Partial<
    Pick<DbOAuthAuthorizationCode, 'used_at'>
>;

export type OAuthAuthorizationCodeTable = Knex.CompositeTableType<
    DbOAuthAuthorizationCode,
    DbOAuthAuthorizationCodeIn,
    DbOAuthAuthorizationCodeUpdate
>;

export const OAuthAuthorizationCodeTableName = 'oauth_authorization_codes';
