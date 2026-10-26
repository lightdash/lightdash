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
