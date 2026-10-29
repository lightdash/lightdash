import { type Knex } from 'knex';

export const OAuth2AuthorizationCodesTableName = 'oauth2_authorization_codes';
export const OAuth2AccessTokensTableName = 'oauth2_access_tokens';
export const OAuth2RefreshTokensTableName = 'oauth2_refresh_tokens';

type DbOAuth2Credential = {
    expires_at: Date;
    scope: string[] | null;
    client_id: string;
    user_id: number;
    organization_uuid: string;
    created_at: Date;
    resource: string | null;
    agent_connection_grant_uuid: string | null;
    session_expires_at: Date | null;
};

export type DbOAuth2AuthorizationCode = DbOAuth2Credential & {
    authorization_code: string;
    redirect_uri: string;
    code_challenge: string | null;
    code_challenge_method: string | null;
};

export type DbOAuth2AccessToken = DbOAuth2Credential & {
    access_token: string;
    family_uuid: string | null;
};

export type DbOAuth2RefreshToken = DbOAuth2Credential & {
    refresh_token: string;
    family_uuid: string | null;
    revoked_at: Date | null;
};

type OAuth2Insert<
    Row extends DbOAuth2Credential,
    Key extends keyof Row,
> = Knex.DbRecord<
    Pick<
        Row,
        Key | 'expires_at' | 'client_id' | 'user_id' | 'organization_uuid'
    > &
        Partial<
            Omit<
                Row,
                | Key
                | 'expires_at'
                | 'client_id'
                | 'user_id'
                | 'organization_uuid'
            >
        >
>;

export type OAuth2AuthorizationCodesTable = Knex.CompositeTableType<
    DbOAuth2AuthorizationCode,
    OAuth2Insert<
        DbOAuth2AuthorizationCode,
        'authorization_code' | 'redirect_uri'
    >,
    Knex.DbRecord<Partial<DbOAuth2AuthorizationCode>>
>;
export type OAuth2AccessTokensTable = Knex.CompositeTableType<
    DbOAuth2AccessToken,
    OAuth2Insert<DbOAuth2AccessToken, 'access_token'>,
    Knex.DbRecord<Partial<DbOAuth2AccessToken>>
>;
export type OAuth2RefreshTokensTable = Knex.CompositeTableType<
    DbOAuth2RefreshToken,
    OAuth2Insert<DbOAuth2RefreshToken, 'refresh_token'>,
    Knex.DbRecord<Partial<DbOAuth2RefreshToken>>
>;
