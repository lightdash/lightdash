import { SEED_PROJECT } from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v1';

describe('Service Accounts API', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
        admin = await login();
    });

    it('Should create a service account', async () => {
        const serviceAccount = {
            description: 'e2e test service account',
            expiresAt: '2025-09-11T14:00:00.000Z',
            scopes: ['org:admin'],
        };
        const resp = await admin.post<
            Body<{
                token: string;
                description: string;
                expiresAt: string;
                scopes: string[];
            }>
        >(`${apiUrl}/service-accounts`, serviceAccount);
        expect(resp.status).toBe(201);
        expect(resp.body.results).toHaveProperty('token');
        expect(resp.body.results).toHaveProperty(
            'description',
            serviceAccount.description,
        );
        expect(resp.body.results).toHaveProperty(
            'expiresAt',
            serviceAccount.expiresAt,
        );
        expect(resp.body.results.scopes).toEqual(serviceAccount.scopes);
    });

    it('Should list service accounts', async () => {
        const resp = await admin.get<
            Body<
                Array<{
                    uuid: string;
                    description: string;
                    createdAt: string;
                    expiresAt: string;
                    scopes: string[];
                }>
            >
        >(`${apiUrl}/service-accounts`);
        expect(resp.status).toBe(200);
        expect(resp.body.results).toBeInstanceOf(Array);
        if (resp.body.results.length > 0) {
            const firstAccount = resp.body.results[0];
            expect(firstAccount).toHaveProperty('uuid');
            expect(firstAccount).toHaveProperty('description');
            expect(firstAccount).toHaveProperty('createdAt');
            expect(firstAccount).toHaveProperty('expiresAt');
            expect(firstAccount).toHaveProperty('scopes');
        }
    });

    it('Should access authorized endpoints with service account token', async () => {
        const serviceAccount = {
            description: 'e2e test service account for auth',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            scopes: ['org:admin'],
        };
        const createResp = await admin.post<Body<{ token: string }>>(
            `${apiUrl}/service-accounts`,
            serviceAccount,
        );
        const { token } = createResp.body.results;

        // Use a fresh client (no cookies) with bearer token
        const anonClient = new ApiClient();
        const resp = await anonClient.get(`${apiUrl}/org/projects`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(resp.status).toBe(200);
    });

    it('Should access /groupAccesses with "org:admin" service account token', async () => {
        const serviceAccount = {
            description: 'e2e test service account for auth',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            scopes: ['org:admin'],
        };
        const createResp = await admin.post<Body<{ token: string }>>(
            `${apiUrl}/service-accounts`,
            serviceAccount,
        );
        const { token } = createResp.body.results;

        const anonClient = new ApiClient();
        const resp = await anonClient.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/groupAccesses`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        expect(resp.status).toBe(200);
    });

    it('Should not access /groupAccesses with "org:read" service account token', async () => {
        const serviceAccount = {
            description: 'e2e test service account for auth',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            scopes: ['org:read'],
        };
        const createResp = await admin.post<Body<{ token: string }>>(
            `${apiUrl}/service-accounts`,
            serviceAccount,
        );
        const { token } = createResp.body.results;

        const anonClient = new ApiClient();
        const resp = await anonClient.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/groupAccesses`,
            {
                headers: { Authorization: `Bearer ${token}` },
                failOnStatusCode: false,
            },
        );
        expect(resp.status).toBe(403);
    });

    it('Should not access unauthorized endpoints with service account token', async () => {
        const serviceAccount = {
            description: 'e2e test service account for unauth',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            scopes: ['org:admin'],
        };
        const createResp = await admin.post<Body<{ token: string }>>(
            `${apiUrl}/service-accounts`,
            serviceAccount,
        );
        const { token } = createResp.body.results;

        const anonClient = new ApiClient();
        const resp = await anonClient.get(`${apiUrl}/org/allowedEmailDomains`, {
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(401);
    });
});
