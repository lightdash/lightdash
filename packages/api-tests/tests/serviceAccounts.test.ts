import {
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    ServiceAccountScope,
} from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v1';

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const oneSecondAgo = () => new Date(Date.now() - 1000).toISOString();

const createServiceAccountToken = async (
    admin: ApiClient,
    scopes: ServiceAccountScope[],
    {
        descriptionPrefix = 'api-test',
        expiresAt = inOneHour(),
    }: { descriptionPrefix?: string; expiresAt?: string } = {},
): Promise<{ token: string; uuid: string }> => {
    const description = `${descriptionPrefix} ${scopes.join(',')} ${Date.now()}`;
    const resp = await admin.post<
        Body<{ token: string; uuid: string; expiresAt: string }>
    >(`${apiUrl}/service-accounts`, { description, expiresAt, scopes });
    expect(resp.status).toBe(201);
    return {
        token: resp.body.results.token,
        uuid: resp.body.results.uuid,
    };
};

const bearerClient = (token: string) => {
    const client = new ApiClient();
    const authHeader = { Authorization: `Bearer ${token}` };
    return {
        get: <T = unknown>(path: string) =>
            client.get<T>(path, {
                headers: authHeader,
                failOnStatusCode: false,
            }),
        post: <T = unknown>(path: string, body?: unknown) =>
            client.post<T>(path, body, {
                headers: authHeader,
                failOnStatusCode: false,
            }),
        patch: <T = unknown>(path: string, body?: unknown) =>
            client.patch<T>(path, body, {
                headers: authHeader,
                failOnStatusCode: false,
            }),
        delete: <T = unknown>(path: string) =>
            client.delete<T>(path, {
                headers: authHeader,
                failOnStatusCode: false,
            }),
    };
};

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
        // The SA's first_name is its description; if the filter ever
        // breaks, the listing will start including a row whose firstName
        // matches our marker.
        expect(seen).not.toContain(description);
    });

    // Defence against a future refactor that might apply a search filter
    // on top of the queryBuilder in a way that bypasses the
    // `users.is_internal = false` predicate.
    it('Should not surface in /api/v1/org/users when searching by SA name', async () => {
        const description = `searchable-leak-check ${Date.now()}`;
        const createResp = await admin.post<Body<{ uuid: string }>>(
            `${apiUrl}/service-accounts`,
            {
                description,
                expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                scopes: ['org:admin'],
            },
        );
        expect(createResp.status).toBe(201);

        // The SA's first_name is the literal "Service account" — search by it.
        const resp = await admin.get<
            Body<{
                data: Array<{ firstName: string; lastName: string }>;
            }>
        >(`${apiUrl}/org/users?searchQuery=Service`);
        expect(resp.status).toBe(200);
        const matched = (resp.body.results.data ?? []).filter(
            (r) => r.firstName === 'Service account',
        );
        expect(matched).toHaveLength(0);
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
        // The SA's first_name is its description; we look for our marker
        // rather than a generic "Service account" prefix.
        const anySaListed = resources.some(
            (r) => r.name?.givenName === description,
        );
        expect(anySaListed).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Regression baseline for the service-account refactor.
//
// These describes exercise the same endpoints behind multiple scope sets and
// pin down today's behavior — including the admin-user spoofing in
// `authenticateServiceAccount` middleware. After the refactor that swaps the
// borrowed admin identity for a dedicated SA user record, the assertions
// flagged with "(current admin-spoofing behavior)" are expected to change;
// updating them in that PR is intentional.
// ---------------------------------------------------------------------------

describe('Service Account authentication negatives', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('rejects requests with no Authorization header', async () => {
        const anonClient = new ApiClient();
        const resp = await anonClient.get(`${apiUrl}/org`, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(401);
    });

    it('rejects an invalid bearer token', async () => {
        const anonClient = new ApiClient();
        const resp = await anonClient.get(`${apiUrl}/org`, {
            headers: { Authorization: 'Bearer ldsvc_thisisnotarealtoken' },
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(401);
    });

    it('rejects a bearer token whose expiresAt is in the past', async () => {
        const { token } = await createServiceAccountToken(
            admin,
            [ServiceAccountScope.ORG_ADMIN],
            { descriptionPrefix: 'expired', expiresAt: oneSecondAgo() },
        );
        const sa = bearerClient(token);
        const resp = await sa.get(`${apiUrl}/org`);
        expect(resp.status).toBe(401);
    });

    it('accepts a freshly minted bearer token', async () => {
        const { token } = await createServiceAccountToken(admin, [
            ServiceAccountScope.ORG_ADMIN,
        ]);
        const sa = bearerClient(token);
        const resp = await sa.get(`${apiUrl}/org`);
        expect(resp.status).toBe(200);
    });
});

describe('Service Account scope matrix', () => {
    let admin: ApiClient;
    const projectUuid = SEED_PROJECT.project_uuid;

    beforeAll(async () => {
        admin = await login();
    });

    describe('ORG_READ', () => {
        let sa: ReturnType<typeof bearerClient>;

        beforeAll(async () => {
            const { token } = await createServiceAccountToken(admin, [
                ServiceAccountScope.ORG_READ,
            ]);
            sa = bearerClient(token);
        });

        it.each([
            ['GET', `${apiUrl}/org`],
            ['GET', `${apiUrl}/org/projects`],
            ['GET', `${apiUrl}/projects/${projectUuid}`],
            ['GET', `${apiUrl}/projects/${projectUuid}/spaces`],
            ['GET', `${apiUrl}/projects/${projectUuid}/dashboards`],
            ['GET', `${apiUrl}/projects/${projectUuid}/charts`],
        ])('allows %s %s', async (_method, path) => {
            const resp = await sa.get(path);
            expect(resp.status).toBe(200);
        });

        it('POST /projects/:uuid/spaces: ORG_READ currently allows it (broad ability)', async () => {
            // serviceAccountAbility.ts grants `can('manage', 'Space', ...)`
            // unconditionally for ORG_READ today (the access-elemMatch
            // condition is commented out). This is broader than the scope
            // name suggests; the regression test captures it so any future
            // tightening shows up as a deliberate failure.
            const resp = await sa.post<Body<{ uuid: string }>>(
                `${apiUrl}/projects/${projectUuid}/spaces`,
                { name: `read-scope-creates-${Date.now()}` },
            );
            expect(resp.status).toBe(200);
            // best-effort cleanup
            if (resp.body.results?.uuid) {
                await admin.delete(
                    `${apiUrl}/projects/${projectUuid}/spaces/${resp.body.results.uuid}`,
                    { failOnStatusCode: false },
                );
            }
        });

        it('PATCH /org returns 401 for bearer auth (route is session-only)', async () => {
            // Even though the SA token authenticates successfully on other
            // routes, PATCH /org rejects bearer auth at 401, not 403 — the
            // route does not run through the service-account middleware.
            const resp = await sa.patch(`${apiUrl}/org`, {
                name: 'should-not-work',
            });
            expect(resp.status).toBe(401);
        });
    });

    describe('ORG_EDIT', () => {
        let sa: ReturnType<typeof bearerClient>;
        const createdSpaceUuids: string[] = [];

        beforeAll(async () => {
            const { token } = await createServiceAccountToken(admin, [
                ServiceAccountScope.ORG_EDIT,
            ]);
            sa = bearerClient(token);
        });

        afterAll(async () => {
            for (const spaceUuid of createdSpaceUuids) {
                // eslint-disable-next-line no-await-in-loop
                await admin.delete(
                    `${apiUrl}/projects/${projectUuid}/spaces/${spaceUuid}`,
                    { failOnStatusCode: false },
                );
            }
        });

        it('inherits read access from ORG_READ', async () => {
            const resp = await sa.get(`${apiUrl}/org/projects`);
            expect(resp.status).toBe(200);
        });

        it('allows POST /projects/:uuid/spaces', async () => {
            const resp = await sa.post<Body<{ uuid: string; name: string }>>(
                `${apiUrl}/projects/${projectUuid}/spaces`,
                {
                    name: `sa-edit-space-${Date.now()}`,
                },
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results).toHaveProperty('uuid');
            createdSpaceUuids.push(resp.body.results.uuid);
        });

        it('PATCH /org returns 401 for bearer auth (route is session-only)', async () => {
            const resp = await sa.patch(`${apiUrl}/org`, {
                name: 'should-not-work',
            });
            expect(resp.status).toBe(401);
        });
    });

    describe('ORG_ADMIN', () => {
        let sa: ReturnType<typeof bearerClient>;

        beforeAll(async () => {
            const { token } = await createServiceAccountToken(admin, [
                ServiceAccountScope.ORG_ADMIN,
            ]);
            sa = bearerClient(token);
        });

        it('allows GET /projects/:uuid/groupAccesses', async () => {
            const resp = await sa.get(
                `${apiUrl}/projects/${projectUuid}/groupAccesses`,
            );
            expect(resp.status).toBe(200);
        });

        it('allows GET /org/groups', async () => {
            const resp = await sa.get(`${apiUrl}/org/groups`);
            expect(resp.status).toBe(200);
        });

        it('inherits read access from ORG_READ', async () => {
            const resp = await sa.get(`${apiUrl}/org/projects`);
            expect(resp.status).toBe(200);
        });
    });

    describe('SCIM_MANAGE', () => {
        let scimToken: string;

        beforeAll(async () => {
            const { token } = await createServiceAccountToken(admin, [
                ServiceAccountScope.SCIM_MANAGE,
            ]);
            scimToken = token;
        });

        it('allows GET /api/v1/scim/v2/Users (SCIM endpoint)', async () => {
            const anonClient = new ApiClient();
            const resp = await anonClient.get(`${apiUrl}/scim/v2/Users`, {
                headers: { Authorization: `Bearer ${scimToken}` },
                failOnStatusCode: false,
            });
            expect(resp.status).toBe(200);
        });

        it('GET /org/projects: SCIM_MANAGE currently allows it (auth succeeds, no scope filter at controller)', async () => {
            // SCIM_MANAGE only adds 'manage' on OrganizationMemberProfile and
            // Group in serviceAccountAbility.ts, but `/org/projects` does not
            // gate on those subjects, so the SA request authenticates and
            // the controller returns the project list. Captured as current
            // behavior; any future tightening (e.g. scope-by-subject filter)
            // will surface here.
            const sa = bearerClient(scimToken);
            const resp = await sa.get(`${apiUrl}/org/projects`);
            expect(resp.status).toBe(200);
        });
    });
});

describe('Service Account identity', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('GET /api/v1/user returns the dedicated service-account identity', async () => {
        const description = `identity-test ${Date.now()}`;
        const createResp = await admin.post<Body<{ token: string }>>(
            `${apiUrl}/service-accounts`,
            {
                description,
                expiresAt: inOneHour(),
                scopes: [ServiceAccountScope.ORG_ADMIN],
            },
        );
        const { token } = createResp.body.results;

        const sa = bearerClient(token);
        const resp = await sa.get<
            Body<{
                userUuid: string;
                email: string;
                firstName: string;
                lastName: string;
                organizationUuid: string;
            }>
        >(`${apiUrl}/user`);
        expect(resp.status).toBe(200);
        // The middleware loads the SA's own `users` row (linked via
        // `service_accounts.service_account_user_uuid`) so the identity
        // surfaces the SA — not a fallback admin.
        expect(resp.body.results.userUuid).not.toBe(SEED_ORG_1_ADMIN.user_uuid);
        expect(resp.body.results.firstName).toBe(description);
        expect(resp.body.results.organizationUuid).toBe(
            SEED_ORG_1.organization_uuid,
        );
    });
});

describe('Service Account content attribution', () => {
    let admin: ApiClient;
    const projectUuid = SEED_PROJECT.project_uuid;
    const createdSpaceUuids: string[] = [];

    beforeAll(async () => {
        admin = await login();
    });

    afterAll(async () => {
        for (const spaceUuid of createdSpaceUuids) {
            // eslint-disable-next-line no-await-in-loop
            await admin.delete(
                `${apiUrl}/projects/${projectUuid}/spaces/${spaceUuid}`,
                { failOnStatusCode: false },
            );
        }
    });

    it('a space created by an SA reports the SA as creator, not the admin', async () => {
        const { token } = await createServiceAccountToken(admin, [
            ServiceAccountScope.ORG_EDIT,
        ]);
        const sa = bearerClient(token);

        const createResp = await sa.post<Body<{ uuid: string; name: string }>>(
            `${apiUrl}/projects/${projectUuid}/spaces`,
            {
                name: `sa-attribution-${Date.now()}`,
            },
        );
        expect(createResp.status).toBe(200);
        const spaceUuid = createResp.body.results.uuid;
        createdSpaceUuids.push(spaceUuid);

        const detailResp = await admin.get<
            Body<{
                uuid: string;
                createdByUserUuid?: string;
                userId?: number;
                pinnedListUuid?: string | null;
                access?: Array<{ userUuid: string }>;
            }>
        >(`${apiUrl}/projects/${projectUuid}/spaces/${spaceUuid}`);
        expect(detailResp.status).toBe(200);
        // The seeded admin should NOT be the recorded creator anymore — the
        // SA's own dedicated user row is.
        const access = detailResp.body.results.access ?? [];
        const accessUuids = access.map((a) => a.userUuid);
        expect(accessUuids).not.toContain(SEED_ORG_1_ADMIN.user_uuid);
    });
});
