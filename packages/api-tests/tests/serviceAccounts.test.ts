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

    // Regression test for the per-SA user-record refactor.
    // Each create now provisions a dedicated `users` row + `organization_memberships`
    // row in the same transaction; if that path 500s we'd never get a token back.
    // Delete is tombstone-only — drops the service_accounts row, leaves the user
    // record so historical FKs (`created_by_user_uuid`) keep resolving.
    it('Should create a SA with a linked user, authenticate, then revoke on delete', async () => {
        const description = `lifecycle test ${Date.now()}`;
        const createResp = await admin.post<
            Body<{ uuid: string; token: string }>
        >(`${apiUrl}/service-accounts`, {
            description,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            scopes: ['org:edit'],
        });
        expect(createResp.status).toBe(201);
        const { uuid, token } = createResp.body.results;
        expect(token).toMatch(/^ldsvc_/);

        // Token authenticates → the FK chain SA → users → org_memberships
        // resolved successfully at create time, otherwise the middleware
        // would 500 here trying to load the SA's user.
        const tokenClient = new ApiClient();
        const authResp = await tokenClient.get(`${apiUrl}/org/projects`, {
            headers: { Authorization: `Bearer ${token}` },
            failOnStatusCode: false,
        });
        expect(authResp.status).toBe(200);

        // Tombstone-on-delete: the service_accounts row goes away (token
        // rejected) but the linked user row persists. We can only observe
        // the first half via the API.
        const deleteResp = await admin.delete(
            `${apiUrl}/service-accounts/${uuid}`,
            { failOnStatusCode: false },
        );
        expect(deleteResp.status).toBe(200);

        const afterDeleteResp = await tokenClient.get(
            `${apiUrl}/org/projects`,
            {
                headers: { Authorization: `Bearer ${token}` },
                failOnStatusCode: false,
            },
        );
        expect(afterDeleteResp.status).toBe(401);
    });

    // Two SAs with the same description should both create their own
    // dedicated user record — there's no uniqueness constraint on the
    // description / SA-user name pair. Captures that the per-SA user
    // provisioning doesn't accidentally try to reuse a user row.
    it('Should allow two service accounts with identical descriptions', async () => {
        const description = `duplicate description ${Date.now()}`;
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        const a = await admin.post<Body<{ uuid: string; token: string }>>(
            `${apiUrl}/service-accounts`,
            { description, expiresAt, scopes: ['org:read'] },
        );
        const b = await admin.post<Body<{ uuid: string; token: string }>>(
            `${apiUrl}/service-accounts`,
            { description, expiresAt, scopes: ['org:read'] },
        );

        expect(a.status).toBe(201);
        expect(b.status).toBe(201);
        expect(a.body.results.uuid).not.toBe(b.body.results.uuid);
        expect(a.body.results.token).not.toBe(b.body.results.token);
    });

    // Service-account user records live in the `users` table for FK
    // purposes but must not leak into any human-facing surface (admin org
    // member list, SCIM /Users, share/invite pickers, login-by-email).
    it('Should not appear in /api/v1/org/users listing', async () => {
        const description = `listing-leak-check ${Date.now()}`;
        const createResp = await admin.post<Body<{ uuid: string }>>(
            `${apiUrl}/service-accounts`,
            {
                description,
                expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                scopes: ['org:admin'],
            },
        );
        expect(createResp.status).toBe(201);

        // Fetch every page; we want a global check, not just the first page.
        const seen: string[] = [];
        let page = 1;
        const pageSize = 100;
        for (;;) {
            // eslint-disable-next-line no-await-in-loop
            const resp = await admin.get<
                Body<{
                    data: Array<{
                        firstName: string;
                        lastName: string;
                        email?: string;
                    }>;
                    pagination?: { totalResults: number };
                }>
            >(`${apiUrl}/org/users?pageSize=${pageSize}&page=${page}`);
            expect(resp.status).toBe(200);
            const rows = resp.body.results.data ?? [];
            seen.push(
                ...rows.map((r) => `${r.firstName} ${r.lastName}`.trim()),
            );
            if (rows.length < pageSize) break;
            page += 1;
            if (page > 50) break; // hard stop to prevent runaway loops
        }
        expect(seen).not.toContain(`Service account ${description}`);
        // Stronger: no user with first_name 'Service account' should appear.
        const anyServiceAccountListed = seen.some((name) =>
            name.startsWith('Service account '),
        );
        expect(anyServiceAccountListed).toBe(false);
    });

    // SCIM /Users feeds IdPs (Okta/Azure AD). Leaking SAs would cause the
    // IdP to attempt deprovisioning machine principals it doesn't own.
    it('Should not appear in SCIM /Users listing', async () => {
        const description = `scim-leak-check ${Date.now()}`;
        const scimResp = await admin.post<Body<{ token: string }>>(
            `${apiUrl}/service-accounts`,
            {
                description,
                expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                scopes: ['scim:manage'],
            },
        );
        expect(scimResp.status).toBe(201);
        const scimToken = scimResp.body.results.token;

        const scimClient = new ApiClient();
        const usersResp = await scimClient.get<{
            Resources: Array<{
                userName?: string;
                name?: { givenName?: string; familyName?: string };
            }>;
            totalResults: number;
        }>(`${apiUrl}/scim/v2/Users?count=1000`, {
            headers: { Authorization: `Bearer ${scimToken}` },
        });
        expect(usersResp.status).toBe(200);
        const resources = usersResp.body.Resources ?? [];
        const anySaListed = resources.some(
            (r) => r.name?.givenName === 'Service account',
        );
        expect(anySaListed).toBe(false);
    });
});
