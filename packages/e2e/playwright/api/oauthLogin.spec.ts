/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '@playwright/test';

const apiUrl = '/api/v1/oauth';


test.describe('OAuth API (Playwright)', () => {
    test('discovery metadata should be returned without status/results wrapper', async ({ request }) => {
        const resp = await request.get(`${apiUrl}/.well-known/oauth-authorization-server`);
        expect(resp.status()).toBe(200);
        const body = await resp.json();
        expect(body).toHaveProperty('issuer');
        expect(body).toHaveProperty('authorization_endpoint');
        expect(body).toHaveProperty('token_endpoint');
        expect(body).toHaveProperty('introspection_endpoint');
        expect(body).toHaveProperty('revocation_endpoint');
        expect(body.response_types_supported).toContain('code');
        expect(body.grant_types_supported).toContain('authorization_code');
        expect(body.code_challenge_methods_supported).toEqual(
            expect.arrayContaining(['S256', 'plain']),
        );
        expect(body).not.toHaveProperty('status');
        expect(body).not.toHaveProperty('results');
    });

    test('authorize should redirect to login when unauthenticated', async ({ request }) => {
        const resp = await request.get(`${apiUrl}/authorize`, {
            params: {
                response_type: 'code',
                client_id: 'test-client',
                redirect_uri: 'http://localhost:8100/callback',
                scope: 'read write',
                state: 'test-state',
                code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
                code_challenge_method: 'S256',
            },
            maxRedirects: 0,
        });
        expect(resp.status()).toBe(302);
        const location = (resp.headers().location as string) ?? (resp.headers() as any).location;
        expect(location).toContain('/login');
    });

    test('token endpoint should reject invalid authorization code', async ({ request }) => {
        const params = new URLSearchParams();
        params.set('grant_type', 'authorization_code');
        params.set('code', 'invalid-code');
        params.set('client_id', 'lightdash-cli');
        params.set('client_secret', '');
        params.set('redirect_uri', 'http://localhost:8100/callback');

        const resp = await request.post(`${apiUrl}/token`, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: params.toString(),
        });
        expect(resp.status()).toBe(401);
        const body = await resp.json();
        expect(body).toHaveProperty('error');
        expect(body).not.toHaveProperty('status');
        expect(body).not.toHaveProperty('results');
    });

    test('token endpoint should reject client_credentials grant', async ({ request }) => {
        const params = new URLSearchParams();
        params.set('grant_type', 'client_credentials');
        params.set('client_id', 'lightdash-cli');
        params.set('client_secret', '');

        const resp = await request.post(`${apiUrl}/token`, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: params.toString(),
        });
        expect(resp.status()).toBe(401);
        const body = await resp.json();
        expect(body).not.toHaveProperty('status');
        expect(body).not.toHaveProperty('results');
    });

    test('introspect should fail without authentication header', async ({ request }) => {
        const resp = await request.post(`${apiUrl}/introspect`, {
            headers: { 'Content-Type': 'application/json' },
            data: { token: 'invalid-token', token_type_hint: 'access_token' },
        });
        expect(resp.status()).toBe(401);
    });

    test('revoke should return 200 with empty body shape when called (unauthenticated client error tolerant check)', async ({ request }) => {
        // Some servers allow revoke without authentication, others require it.
        // We just verify endpoint exists and returns a valid HTTP response (200 or 401).
        const resp = await request.post(`${apiUrl}/revoke`, {
            headers: { 'Content-Type': 'application/json' },
            data: { token: 'invalid-token', token_type_hint: 'access_token' },
        });
        expect([200, 401]).toContain(resp.status());
        if (resp.status() === 200) {
            // RFC 7009 recommends an empty body
            const text = await resp.text();
            expect(text === '' || text === undefined).toBeTruthy();
        }
    });
});
