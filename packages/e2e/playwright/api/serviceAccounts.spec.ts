import { test, expect } from '@playwright/test';
import { SEED_PROJECT } from '@lightdash/common';
import { login, logout } from '../support/auth';

const apiUrl = '/api/v1';

test.describe('Service Accounts API', () => {
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test('Should create a service account', async ({ request }) => {
        const serviceAccount = {
            description: 'e2e test service account',
            expiresAt: '2025-09-11T14:00:00.000Z',
            scopes: ['org:admin'],
        };

        const response = await request.post(`${apiUrl}/service-accounts`, {
            headers: { 'Content-Type': 'application/json' },
            data: serviceAccount,
        });

        expect(response.status()).toBe(201);
        const body = await response.json();
        expect(body.results).toHaveProperty('token');
        expect(body.results).toHaveProperty('description', serviceAccount.description);
        expect(body.results).toHaveProperty('expiresAt', serviceAccount.expiresAt);
        expect(body.results.scopes).toEqual(serviceAccount.scopes);
    });

    test('Should list service accounts', async ({ request }) => {
        const response = await request.get(`${apiUrl}/service-accounts`);

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.results).toEqual(expect.any(Array));
        
        // Service accounts should have required properties
        if (body.results.length > 0) {
            const firstAccount = body.results[0];
            expect(firstAccount).toHaveProperty('uuid');
            expect(firstAccount).toHaveProperty('description');
            expect(firstAccount).toHaveProperty('createdAt');
            expect(firstAccount).toHaveProperty('expiresAt');
            expect(firstAccount).toHaveProperty('scopes');
        }
    });

    test('Should access authorized endpoints with service account token', async ({ request }) => {
        // First create a service account
        const serviceAccount = {
            description: 'e2e test service account for auth',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            scopes: ['org:admin'],
        };

        const createResponse = await request.post(`${apiUrl}/service-accounts`, {
            headers: { 'Content-Type': 'application/json' },
            data: serviceAccount,
        });
        
        const createBody = await createResponse.json();
        const { token } = createBody.results;

        // Test accessing projects endpoint with the service account token
        await logout(request);
        
        const authResponse = await request.get(`${apiUrl}/org/projects`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        expect(authResponse.status()).toBe(200);
    });

    test('Should access /groupAccesses with "org:admin" service account token', async ({ request }) => {
        // First create a service account
        const serviceAccount = {
            description: 'e2e test service account for auth',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            scopes: ['org:admin'],
        };

        const createResponse = await request.post(`${apiUrl}/service-accounts`, {
            headers: { 'Content-Type': 'application/json' },
            data: serviceAccount,
        });
        
        const createBody = await createResponse.json();
        const { token } = createBody.results;

        // Test accessing projects endpoint with the service account token
        await logout(request);
        
        const authResponse = await request.get(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/groupAccesses`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        expect(authResponse.status()).toBe(200);
    });

    test('Should not access /groupAccesses with "org:read" service account token', async ({ request }) => {
        // First create a service account
        const serviceAccount = {
            description: 'e2e test service account for auth',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            scopes: ['org:read'],
        };

        const createResponse = await request.post(`${apiUrl}/service-accounts`, {
            headers: { 'Content-Type': 'application/json' },
            data: serviceAccount,
        });
        
        const createBody = await createResponse.json();
        const { token } = createBody.results;

        // Test accessing projects endpoint with the service account token
        await logout(request);
        
        const authResponse = await request.get(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/groupAccesses`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        expect(authResponse.status()).toBe(403);
    });

    test('Should not access unauthorized endpoints with service account token', async ({ request }) => {
        // First create a service account
        const serviceAccount = {
            description: 'e2e test service account for unauth',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            scopes: ['org:admin'],
        };

        const createResponse = await request.post(`${apiUrl}/service-accounts`, {
            headers: { 'Content-Type': 'application/json' },
            data: serviceAccount,
        });
        
        const createBody = await createResponse.json();
        const { token } = createBody.results;

        // Test accessing users endpoint with the service account token
        await logout(request);
        
        const authResponse = await request.get(`${apiUrl}/org/allowedEmailDomains`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        expect(authResponse.status()).toBe(401);
    });
});