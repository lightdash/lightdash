export interface OAuthClient {
    clientUuid: string;
    clientId: string;
    clientSecret: string | undefined;
    clientName: string;
    redirectUris: string[];
    grants: string[];
    scopes: string[] | null;
    createdAt: Date;
    createdByUserUuid: string | null;
    expiresAt: Date | null;
}

export interface OAuthAuthorizationCode {
    authorizationCodeUuid: string;
    authorizationCode: string;
    expiresAt: Date;
    redirectUri: string;
    scopes: string[];
    userUuid: string;
    organizationUuid: string;
    createdAt: Date;
    usedAt: Date | null;
    codeChallenge: string | null;
    codeChallengeMethod: 'S256' | 'plain' | null;
}

export interface OAuthAccessToken {
    accessTokenUuid: string;
    accessToken: string;
    expiresAt: Date;
    scopes: string[];
    userUuid: string;
    organizationUuid: string;
    createdAt: Date;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    authorizationCodeUuid: string | null;
}

export interface OAuthRefreshToken {
    refreshTokenUuid: string;
    refreshToken: string;
    expiresAt: Date;
    scopes: string[];
    userUuid: string;
    organizationUuid: string;
    createdAt: Date;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    accessTokenUuid: string;
}

export interface OAuthTokenRequest {
    grant_type: 'authorization_code' | 'refresh_token' | 'client_credentials';
    code?: string;
    refresh_token?: string;
    redirect_uri?: string;
    client_id: string;
    client_secret: string;
    scope?: string;
    code_verifier?: string;
}

export interface OAuthAuthorizationRequest {
    response_type: 'code';
    client_id: string;
    redirect_uri: string;
    scope?: string;
    state?: string;
    code_challenge?: string;
    code_challenge_method?: 'S256' | 'plain';
}

export interface OAuthTokenResponse {
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    refresh_token?: string;
    scope?: string;
}

export interface OAuthIntrospectRequest {
    token: string;
    token_type_hint?: 'access_token' | 'refresh_token';
    client_id?: string;
    client_secret?: string;
}

export interface OAuthIntrospectResponse {
    active: boolean;
    scope?: string;
    client_id?: string;
    username?: string;
    token_type?: string;
    exp?: number;
    iat?: number;
    nbf?: number;
    sub?: string;
    aud?: string;
    iss?: string;
    jti?: string;
}

export interface OAuthRevokeRequest {
    token: string;
    token_type_hint?: 'access_token' | 'refresh_token';
}

export type UserWithOrganizationUuid = {
    userId: number;
    organizationUuid: string;
};

// OAuth UserInfo (OpenID Connect standard claims)
export interface OAuthUserInfoResponse {
    sub: string;
    name: string;
    given_name: string;
    family_name: string;
    email: string | undefined;
    email_verified: boolean;
    organization_uuid: string | undefined;
    organization_name: string | undefined;
}

// OAuth Client Management
export interface OAuthClientSummary {
    clientId: string;
    clientName: string;
    redirectUris: string[];
    scopes: string[];
    createdAt: Date;
    createdByUserUuid: string | null;
}

export interface CreateOAuthClientRequest {
    clientName: string;
    redirectUris: string[];
}

export interface CreateOAuthClientResponse extends OAuthClientSummary {
    clientSecret: string;
}
