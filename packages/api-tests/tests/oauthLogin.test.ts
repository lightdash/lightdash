import { describe, expect, it } from 'vitest';
import { ApiClient, SITE_URL } from '../helpers/api-client';

type OAuthTokenResponse = {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    scope: string;
};

type OAuthMetadata = {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    introspection_endpoint: string;
    revocation_endpoint: string;
    response_types_supported: string[];
    grant_types_supported: string[];
    code_challenge_methods_supported: string[];
};

type OAuthIntrospectResponse = {
    active: boolean;
    scope: string;
    client_id: string;
    username: string;
    token_type: string;
    exp: number;
    iat: number;
    sub: string;
    aud: string;
    iss: string;
    jti: string;
};

const apiUrl = '/api/v1/oauth';

// PKCE test values - these are pre-computed for testing
const PKCE_TEST_VALUES = {
    codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
};

// Helper to extract redirect URL from HTML response
const extractRedirectUrlFromHtml = (html: string): string => {
    const match = /window\.location\.href = "([^"]+)"/.exec(html);
    if (!match) {
        throw new Error('No redirect URL found in HTML response');
    }
    return match[1];
};

/**
 * Since we can't easily access the internal cookies of ApiClient,
 * we create a helper that logs in and returns both a client and a raw fetch function
 * that carries the same session cookies.
 */
async function createAuthenticatedFetcher(): Promise<{
    client: ApiClient;
    fetchWithAuth: (
        path: string,
        init?: RequestInit,
    ) => Promise<{ status: number; body: unknown; headers: Headers }>;
}> {
    const client = new ApiClient();
    await client.post('/api/v1/login', {
        email: 'demo@lightdash.com',
        password: 'demo_password!',
    });

    // Extract cookies by doing a request and capturing the Set-Cookie
    // Actually, the ApiClient stores cookies internally but doesn't expose them.
    // We need to replicate the login via fetch to track cookies ourselves.

    const loginResp = await fetch(`${SITE_URL}/api/v1/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: 'demo@lightdash.com',
            password: 'demo_password!',
        }),
        redirect: 'manual',
    });

    // Parse cookies from login response
    const cookies: Map<string, string> = new Map();
    const setCookieHeaders = loginResp.headers.getSetCookie();
    // eslint-disable-next-line no-restricted-syntax
    for (const header of setCookieHeaders) {
        const [pair] = header.split(';');
        const eqIdx = pair.indexOf('=');
        if (eqIdx !== -1) {
            const name = pair.slice(0, eqIdx).trim();
            const value = pair.slice(eqIdx + 1).trim();
            cookies.set(name, value);
        }
    }

    const cookieHeader = Array.from(cookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');

    const fetchWithAuth = async (
        path: string,
        init: RequestInit = {},
    ): Promise<{ status: number; body: unknown; headers: Headers }> => {
        const url = path.startsWith('http')
            ? path
            : `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
        const resp = await fetch(url, {
            ...init,
            headers: {
                ...((init.headers as Record<string, string>) || {}),
                Cookie: cookieHeader,
            },
            redirect: 'manual',
        });

        // Parse any new cookies
        const newCookies = resp.headers.getSetCookie();
        // eslint-disable-next-line no-restricted-syntax
        for (const header of newCookies) {
            const [pair] = header.split(';');
            const eqIdx = pair.indexOf('=');
            if (eqIdx !== -1) {
                const name = pair.slice(0, eqIdx).trim();
                const value = pair.slice(eqIdx + 1).trim();
                cookies.set(name, value);
            }
        }

        let body: unknown;
        const contentType = resp.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
            body = await resp.json();
        } else {
            const text = await resp.text();
            // Try parsing as JSON anyway for cases where content-type is wrong
            try {
                body = JSON.parse(text);
            } catch {
                body = text;
            }
        }

        return { status: resp.status, body, headers: resp.headers };
    };

    return { client, fetchWithAuth };
}

/**
 * Helper to POST form-encoded data to the OAuth token endpoint.
 */
async function postFormEncoded<T = unknown>(
    fetchWithAuth: (
        path: string,
        init?: RequestInit,
    ) => Promise<{ status: number; body: unknown; headers: Headers }>,
    path: string,
    body: Record<string, string>,
): Promise<{ status: number; body: T }> {
    return fetchWithAuth(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
    }) as Promise<{ status: number; body: T }>;
}

describe('OAuth API Integration Tests', () => {
    describe('OAuth Discovery', () => {
        it('Should return OAuth server metadata', async () => {
            // No auth needed for discovery
            const resp = await fetch(
                `${SITE_URL}${apiUrl}/.well-known/oauth-authorization-server`,
            );
            const body = (await resp.json()) as OAuthMetadata;

            expect(resp.status).toBe(200);
            expect(body).toHaveProperty('issuer');
            expect(body).toHaveProperty('authorization_endpoint');
            expect(body).toHaveProperty('token_endpoint');
            expect(body).toHaveProperty('introspection_endpoint');
            expect(body).toHaveProperty('revocation_endpoint');
            expect(body.response_types_supported).toContain('code');
            expect(body.grant_types_supported).toContain('authorization_code');
            expect(body.grant_types_supported).toContain('refresh_token');
            expect(body.code_challenge_methods_supported).toContain('S256');
            expect(body.code_challenge_methods_supported).toContain('plain');

            // OAuth2 endpoints should not have the {status, results} wrapper
            expect(body).not.toHaveProperty('status');
            expect(body).not.toHaveProperty('results');
        });
    });

    describe('OAuth Authorization Flow', () => {
        it('Should redirect to login when user is not authenticated', async () => {
            const qs = new URLSearchParams({
                response_type: 'code',
                client_id: 'test-client',
                redirect_uri: 'http://localhost:8100/callback',
                scope: 'read write',
                state: 'test-state',
                code_challenge: PKCE_TEST_VALUES.codeChallenge,
                code_challenge_method: 'S256',
            });

            const resp = await fetch(
                `${SITE_URL}${apiUrl}/authorize?${qs.toString()}`,
                { redirect: 'manual' },
            );
            expect(resp.status).toBe(302);
            expect(resp.headers.get('location')).toContain('/login');
        });

        it('Should return authorization page with hidden fields to submit', async () => {
            const { fetchWithAuth } = await createAuthenticatedFetcher();

            const qs = new URLSearchParams({
                response_type: 'code',
                client_id: 'lightdash-cli',
                redirect_uri: 'http://localhost:8100/callback',
                scope: 'read write',
                state: 'test-state',
                code_challenge: PKCE_TEST_VALUES.codeChallenge,
                code_challenge_method: 'S256',
            });

            const getResponse = await fetchWithAuth(
                `${apiUrl}/authorize?${qs.toString()}`,
                { method: 'GET' },
            );

            const html = getResponse.body as string;
            const extract = (name: string) => {
                const match = new RegExp(
                    `<input[^>]+name=["']${name}["'][^>]+value=["']([^"']*)["']`,
                ).exec(html);
                return match ? match[1] : '';
            };
            const formData = {
                response_type: extract('response_type'),
                client_id: extract('client_id'),
                redirect_uri: extract('redirect_uri'),
                scope: extract('scope'),
                state: extract('state'),
                code_challenge: extract('code_challenge'),
                code_challenge_method: extract('code_challenge_method'),
            };
            expect(formData.response_type).toBe('code');
            expect(formData.client_id).toBe('lightdash-cli');
            expect(formData.redirect_uri).toBe(
                'http://localhost:8100/callback',
            );
            expect(formData.scope).toBe('read write');
            expect(formData.state).toBe('test-state');
            expect(formData.code_challenge).toBe(
                PKCE_TEST_VALUES.codeChallenge,
            );
            expect(formData.code_challenge_method).toBe('S256');
        });

        it('Submit POST /authorize returns authorization code', async () => {
            const { fetchWithAuth } = await createAuthenticatedFetcher();

            const formData = {
                response_type: 'code',
                client_id: 'lightdash-cli',
                redirect_uri: 'http://localhost:8100/callback',
                scope: 'read write',
                state: 'test-state',
                code_challenge: PKCE_TEST_VALUES.codeChallenge,
                code_challenge_method: 'S256',
                approve: 'true',
            };

            const postResponse = await postFormEncoded(
                fetchWithAuth,
                `${apiUrl}/authorize`,
                formData,
            );
            expect(postResponse.status).toBe(200);

            const location = extractRedirectUrlFromHtml(
                postResponse.body as string,
            );
            const redirectUrl = new URL(location);
            const code = redirectUrl.searchParams.get('code') || '';

            expect(code).not.toBe('');
            expect(redirectUrl.searchParams.get('state')).toBe('test-state');
        });
    });

    describe('OAuth Token Endpoint', () => {
        it('Should exchange authorization code for access token', async () => {
            const { fetchWithAuth } = await createAuthenticatedFetcher();

            // Get authorization code
            const formData = {
                response_type: 'code',
                client_id: 'lightdash-cli',
                redirect_uri: 'http://localhost:8100/callback',
                scope: 'read write',
                state: 'test-state',
                code_challenge: PKCE_TEST_VALUES.codeChallenge,
                code_challenge_method: 'S256',
                approve: 'true',
            };

            const postResponse = await postFormEncoded(
                fetchWithAuth,
                `${apiUrl}/authorize`,
                formData,
            );
            expect(postResponse.status).toBe(200);
            const location = extractRedirectUrlFromHtml(
                postResponse.body as string,
            );
            const redirectUrl = new URL(location);
            const code = redirectUrl.searchParams.get('code') || '';
            expect(code).not.toBe('');
            expect(redirectUrl.searchParams.get('state')).toBe('test-state');

            // Exchange code for token
            const tokenResponse = await postFormEncoded<OAuthTokenResponse>(
                fetchWithAuth,
                `${apiUrl}/token`,
                {
                    grant_type: 'authorization_code',
                    code,
                    client_id: 'lightdash-cli',
                    client_secret: '',
                    redirect_uri: 'http://localhost:8100/callback',
                    code_verifier: PKCE_TEST_VALUES.codeVerifier,
                },
            );

            expect(tokenResponse.status).toBe(200);
            expect(tokenResponse.body).toHaveProperty('access_token');
            expect(tokenResponse.body).toHaveProperty('token_type', 'Bearer');
            expect(tokenResponse.body).toHaveProperty('expires_in');
            expect(tokenResponse.body).toHaveProperty('refresh_token');
            expect(tokenResponse.body).toHaveProperty('scope');

            // OAuth2 endpoints should not have the {status, results} wrapper
            expect(tokenResponse.body).not.toHaveProperty('status');
            expect(tokenResponse.body).not.toHaveProperty('results');
        });

        it('Should refresh access token using refresh token', async () => {
            const { fetchWithAuth } = await createAuthenticatedFetcher();

            // Get authorization code
            const formData = {
                response_type: 'code',
                client_id: 'lightdash-cli',
                redirect_uri: 'http://localhost:8100/callback',
                scope: 'read write',
                state: 'test-state',
                code_challenge: PKCE_TEST_VALUES.codeChallenge,
                code_challenge_method: 'S256',
                approve: 'true',
            };

            const postResponse = await postFormEncoded(
                fetchWithAuth,
                `${apiUrl}/authorize`,
                formData,
            );
            expect(postResponse.status).toBe(200);
            const location = extractRedirectUrlFromHtml(
                postResponse.body as string,
            );
            const redirectUrl = new URL(location);
            const code = redirectUrl.searchParams.get('code') || '';
            expect(code).not.toBe('');

            // Exchange code for token
            const tokenResponse = await postFormEncoded<OAuthTokenResponse>(
                fetchWithAuth,
                `${apiUrl}/token`,
                {
                    grant_type: 'authorization_code',
                    code,
                    client_id: 'lightdash-cli',
                    client_secret: '',
                    redirect_uri: 'http://localhost:8100/callback',
                    code_verifier: PKCE_TEST_VALUES.codeVerifier,
                },
            );
            expect(tokenResponse.status).toBe(200);
            expect(tokenResponse.body).toHaveProperty('access_token');

            // Refresh the token
            const refreshResponse = await postFormEncoded<OAuthTokenResponse>(
                fetchWithAuth,
                `${apiUrl}/token`,
                {
                    grant_type: 'refresh_token',
                    refresh_token: tokenResponse.body.refresh_token,
                    client_id: 'lightdash-cli',
                    client_secret: '',
                },
            );

            expect(refreshResponse.status).toBe(200);
            expect(refreshResponse.body).toHaveProperty('access_token');
            expect(refreshResponse.body).toHaveProperty('token_type', 'Bearer');
            expect(refreshResponse.body).toHaveProperty('expires_in');
            expect(refreshResponse.body.access_token).not.toBe(
                tokenResponse.body.access_token,
            );
            expect(refreshResponse.body).not.toHaveProperty('status');
            expect(refreshResponse.body).not.toHaveProperty('results');
        });

        it('Should reject invalid authorization code', async () => {
            const resp = await fetch(`${SITE_URL}${apiUrl}/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: 'invalid-code',
                    client_id: 'lightdash-cli',
                    client_secret: '',
                    redirect_uri: 'http://localhost:8100/callback',
                }).toString(),
            });

            const body = await resp.json();
            expect(resp.status).toBe(401);
            expect(body).toHaveProperty('error');

            // OAuth2 error responses should not have the {status, results} wrapper
            expect(body).not.toHaveProperty('status');
            expect(body).not.toHaveProperty('results');
        });

        it('Should reject client credentials grant type', async () => {
            const resp = await fetch(`${SITE_URL}${apiUrl}/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: 'lightdash-cli',
                    client_secret: '',
                }).toString(),
            });

            const body = await resp.json();
            expect(resp.status).toBe(401);

            // OAuth2 error responses should not have the {status, results} wrapper
            expect(body).not.toHaveProperty('status');
            expect(body).not.toHaveProperty('results');
        });
    });

    describe('OAuth Token Introspection', () => {
        it('Should introspect valid access token', async () => {
            const { fetchWithAuth } = await createAuthenticatedFetcher();

            // Get auth code and exchange for token
            const formData = {
                response_type: 'code',
                client_id: 'lightdash-cli',
                redirect_uri: 'http://localhost:8100/callback',
                scope: 'read write',
                state: 'test-state',
                code_challenge: PKCE_TEST_VALUES.codeChallenge,
                code_challenge_method: 'S256',
                approve: 'true',
            };

            const postResponse = await postFormEncoded(
                fetchWithAuth,
                `${apiUrl}/authorize`,
                formData,
            );
            expect(postResponse.status).toBe(200);
            const location = extractRedirectUrlFromHtml(
                postResponse.body as string,
            );
            const redirectUrl = new URL(location);
            const code = redirectUrl.searchParams.get('code') || '';
            expect(code).not.toBe('');

            const tokenResponse = await postFormEncoded<OAuthTokenResponse>(
                fetchWithAuth,
                `${apiUrl}/token`,
                {
                    grant_type: 'authorization_code',
                    code,
                    client_id: 'lightdash-cli',
                    client_secret: '',
                    redirect_uri: 'http://localhost:8100/callback',
                    code_verifier: PKCE_TEST_VALUES.codeVerifier,
                },
            );
            expect(tokenResponse.status).toBe(200);
            expect(tokenResponse.body).toHaveProperty('access_token');

            // Introspect the access token
            const introspectResponse = await fetchWithAuth(
                `${apiUrl}/introspect`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${tokenResponse.body.access_token}`,
                    },
                    body: JSON.stringify({
                        token: tokenResponse.body.access_token,
                        token_type_hint: 'access_token',
                    }),
                },
            );

            expect(introspectResponse.status).toBe(200);
            expect(introspectResponse.body).toHaveProperty('active', true);
            expect(introspectResponse.body).toHaveProperty('scope');
            expect(introspectResponse.body).toHaveProperty('client_id');
            expect(introspectResponse.body).toHaveProperty('username');
            expect(introspectResponse.body).toHaveProperty(
                'token_type',
                'access_token',
            );
            expect(introspectResponse.body).toHaveProperty('exp');
            expect(introspectResponse.body).toHaveProperty('iat');
            expect(introspectResponse.body).toHaveProperty('sub');
            expect(introspectResponse.body).toHaveProperty('aud');
            expect(introspectResponse.body).toHaveProperty('iss', 'lightdash');
            expect(introspectResponse.body).toHaveProperty('jti');

            // OAuth2 endpoints should not have the {status, results} wrapper
            expect(introspectResponse.body).not.toHaveProperty('status');
            expect(introspectResponse.body).not.toHaveProperty('results');
        });

        it('Should return inactive for invalid token', async () => {
            const { fetchWithAuth } = await createAuthenticatedFetcher();

            const response = await fetchWithAuth(`${apiUrl}/introspect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ldapp_invalid-token',
                },
                body: JSON.stringify({
                    token: 'invalid-token',
                    token_type_hint: 'access_token',
                }),
            });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('active', false);

            // OAuth2 endpoints should not have the {status, results} wrapper
            expect(response.body).not.toHaveProperty('status');
            expect(response.body).not.toHaveProperty('results');
        });

        it('Should return error for introspect request without authentication', async () => {
            const resp = await fetch(`${SITE_URL}${apiUrl}/introspect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: 'invalid-token',
                    token_type_hint: 'access_token',
                }),
            });

            expect(resp.status).toBe(401);
        });
    });

    describe('OAuth Token Revocation', () => {
        it('Should revoke access token', async () => {
            const { fetchWithAuth } = await createAuthenticatedFetcher();

            // Get the authorization page and extract form fields
            const qs = new URLSearchParams({
                response_type: 'code',
                client_id: 'lightdash-cli',
                redirect_uri: 'http://localhost:8100/callback',
                scope: 'read write',
                state: 'test-state',
                code_challenge: PKCE_TEST_VALUES.codeChallenge,
                code_challenge_method: 'S256',
            });

            const getResponse = await fetchWithAuth(
                `${apiUrl}/authorize?${qs.toString()}`,
                { method: 'GET' },
            );

            const html = getResponse.body as string;
            const extract = (name: string) => {
                const match = new RegExp(
                    `<input[^>]+name=["']${name}["'][^>]+value=["']([^"']*)["']`,
                ).exec(html);
                return match ? match[1] : '';
            };
            const formData = {
                response_type: extract('response_type'),
                client_id: extract('client_id'),
                redirect_uri: extract('redirect_uri'),
                scope: extract('scope'),
                state: extract('state'),
                code_challenge: extract('code_challenge'),
                code_challenge_method: extract('code_challenge_method'),
                approve: 'true',
            };

            // Submit authorization
            const postResponse = await postFormEncoded(
                fetchWithAuth,
                `${apiUrl}/authorize`,
                formData,
            );
            expect(postResponse.status).toBe(200);
            const location = extractRedirectUrlFromHtml(
                postResponse.body as string,
            );
            const redirectUrl = new URL(location);
            const code = redirectUrl.searchParams.get('code') || '';
            expect(code).not.toBe('');

            // Exchange code for token
            const tokenResponse = await postFormEncoded<OAuthTokenResponse>(
                fetchWithAuth,
                `${apiUrl}/token`,
                {
                    grant_type: 'authorization_code',
                    code,
                    client_id: 'lightdash-cli',
                    client_secret: '',
                    redirect_uri: 'http://localhost:8100/callback',
                    code_verifier: PKCE_TEST_VALUES.codeVerifier,
                },
            );

            // Revoke the token
            const revokeResponse = await fetchWithAuth(`${apiUrl}/revoke`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: tokenResponse.body.access_token,
                    token_type_hint: 'access_token',
                }),
            });
            expect(revokeResponse.status).toBe(200);

            // Verify token is revoked by introspecting it
            const introspectResponse = await fetchWithAuth(
                `${apiUrl}/introspect`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        token: tokenResponse.body.access_token,
                        token_type_hint: 'access_token',
                    }),
                },
            );
            expect(introspectResponse.status).toBe(200);
            expect(introspectResponse.body).toHaveProperty('active', false);
        });
    });

    describe('OAuth Authentication Middleware', () => {
        it('Should authenticate with valid OAuth token', async () => {
            const { fetchWithAuth } = await createAuthenticatedFetcher();

            // Get auth page, submit, exchange for token
            const qs = new URLSearchParams({
                response_type: 'code',
                client_id: 'lightdash-cli',
                redirect_uri: 'http://localhost:8100/callback',
                scope: 'read write',
                state: 'test-state',
                code_challenge: PKCE_TEST_VALUES.codeChallenge,
                code_challenge_method: 'S256',
            });

            const getResponse = await fetchWithAuth(
                `${apiUrl}/authorize?${qs.toString()}`,
                { method: 'GET' },
            );

            const html = getResponse.body as string;
            const extract = (name: string) => {
                const match = new RegExp(
                    `<input[^>]+name=["']${name}["'][^>]+value=["']([^"']*)["']`,
                ).exec(html);
                return match ? match[1] : '';
            };
            const formData = {
                response_type: extract('response_type'),
                client_id: extract('client_id'),
                redirect_uri: extract('redirect_uri'),
                scope: extract('scope'),
                state: extract('state'),
                code_challenge: extract('code_challenge'),
                code_challenge_method: extract('code_challenge_method'),
                approve: 'true',
            };

            const postResponse = await postFormEncoded(
                fetchWithAuth,
                `${apiUrl}/authorize`,
                formData,
            );
            expect(postResponse.status).toBe(200);
            const location = extractRedirectUrlFromHtml(
                postResponse.body as string,
            );
            const redirectUrl = new URL(location);
            const code = redirectUrl.searchParams.get('code') || '';
            expect(code).not.toBe('');

            const tokenResponse = await postFormEncoded<OAuthTokenResponse>(
                fetchWithAuth,
                `${apiUrl}/token`,
                {
                    grant_type: 'authorization_code',
                    code,
                    client_id: 'lightdash-cli',
                    client_secret: '',
                    redirect_uri: 'http://localhost:8100/callback',
                    code_verifier: PKCE_TEST_VALUES.codeVerifier,
                },
            );

            // Test that the token can be used to access protected endpoints
            // Note: Cypress always sends session cookies alongside the Bearer token,
            // so we use fetchWithAuth to match that behavior.
            const userResponse = await fetchWithAuth('/api/v1/user', {
                headers: {
                    Authorization: `Bearer ${tokenResponse.body.access_token}`,
                },
            });

            expect(userResponse.status).toBe(200);
            const userBody = userResponse.body as {
                status: string;
                results: { userUuid: string; organizationUuid: string };
            };
            expect(userBody).toHaveProperty('status', 'ok');
            expect(userBody).toHaveProperty('results');
            expect(userBody.results).toHaveProperty('userUuid');
            expect(userBody.results).toHaveProperty('organizationUuid');
        });

        it('Should reject invalid OAuth token', async () => {
            const resp = await fetch(`${SITE_URL}/api/v1/user`, {
                headers: {
                    Authorization: 'Bearer invalid-token',
                },
            });

            expect(resp.status).toBe(401);
        });
    });
});
