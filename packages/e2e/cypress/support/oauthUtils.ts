import { OAuthTokenRequest } from '@lightdash/common';

export interface OAuthTestConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string;
}

export const DEFAULT_OAUTH_CONFIG: OAuthTestConfig = {
    clientId: 'lightdash-cli',
    clientSecret: 'cli-secret',
    redirectUri: 'http://localhost:3000/callback',
    scope: 'read write',
};

// PKCE test values - these are pre-computed for testing
export const PKCE_TEST_VALUES = {
    codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
};

/**
 * Get authorization code for testing
 */
export const getAuthorizationCode = (
    config: OAuthTestConfig = DEFAULT_OAUTH_CONFIG,
    state = 'test-state',
    codeChallenge = PKCE_TEST_VALUES.codeChallenge,
): Cypress.Chainable<string> =>
    cy
        .request({
            method: 'GET',
            url: '/api/v1/oauth/authorize',
            qs: {
                response_type: 'code',
                client_id: config.clientId,
                redirect_uri: config.redirectUri,
                scope: config.scope,
                state,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256',
            },
            followRedirect: false,
        })
        .then((response) => {
            const { location } = response.headers;
            if (typeof location === 'string') {
                const redirectUrl = new URL(location);
                return redirectUrl.searchParams.get('code') || '';
            }
            return '';
        });

/**
 * Exchange authorization code for access token
 */
export const exchangeCodeForToken = (
    code: string,
    config: OAuthTestConfig = DEFAULT_OAUTH_CONFIG,
    codeVerifier = 'test-verifier',
): Cypress.Chainable<{
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
}> => {
    const tokenRequest: OAuthTokenRequest = {
        grant_type: 'authorization_code',
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code_verifier: codeVerifier,
    };

    return cy
        .request({
            method: 'POST',
            url: '/api/v1/oauth/token',
            body: tokenRequest,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        })
        .then((response) => {
            expect(response.status).to.eq(200);
            return response.body;
        });
};

/**
 * Refresh access token using refresh token
 */
export const refreshToken = (
    refreshTokenArg: string,
    config: OAuthTestConfig = DEFAULT_OAUTH_CONFIG,
): Cypress.Chainable<{
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
}> => {
    const refreshRequest: OAuthTokenRequest = {
        grant_type: 'refresh_token',
        refresh_token: refreshTokenArg,
        client_id: config.clientId,
        client_secret: config.clientSecret,
    };

    return cy
        .request({
            method: 'POST',
            url: '/api/v1/oauth/token',
            body: refreshRequest,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        })
        .then((response) => {
            expect(response.status).to.eq(200);
            return response.body;
        });
};

/**
 * Introspect access token
 */
export const introspectToken = (
    token: string,
    tokenTypeHint: 'access_token' | 'refresh_token' = 'access_token',
): Cypress.Chainable<{
    active: boolean;
    scope?: string;
    client_id?: string;
    username?: string;
    token_type?: string;
    exp?: number;
    iat?: number;
    sub?: string;
    aud?: string;
    iss?: string;
    jti?: string;
}> =>
    cy
        .request({
            method: 'POST',
            url: '/api/v1/oauth/introspect',
            body: {
                token,
                token_type_hint: tokenTypeHint,
            },
            headers: {
                'Content-Type': 'application/json',
            },
        })
        .then((response) => {
            expect(response.status).to.eq(200);
            return response.body;
        });

/**
 * Get OAuth server metadata
 */
export const getServerMetadata = (): Cypress.Chainable<{
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    introspection_endpoint: string;
    revocation_endpoint: string;
    response_types_supported: string[];
    grant_types_supported: string[];
    token_endpoint_auth_methods_supported: string[];
    scopes_supported: string[];
    code_challenge_methods_supported: string[];
    pkce_required: boolean;
}> =>
    cy
        .request({
            method: 'GET',
            url: '/api/v1/oauth/.well-known/oauth-authorization-server',
        })
        .then((response) => {
            expect(response.status).to.eq(200);
            return response.body;
        });

/**
 * Test protected endpoint with OAuth token
 */
export const testProtectedEndpoint = (
    token: string,
    endpoint = '/api/v1/user',
): Cypress.Chainable<unknown> =>
    cy
        .request({
            method: 'GET',
            url: endpoint,
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })
        .then((response) => {
            expect(response.status).to.eq(200);
            return response.body;
        });

/**
 * Complete OAuth flow and get tokens
 */
export const completeOAuthFlow = (
    config: OAuthTestConfig = DEFAULT_OAUTH_CONFIG,
): Cypress.Chainable<{
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
}> =>
    getAuthorizationCode(config).then((code) =>
        exchangeCodeForToken(code, config),
    );
