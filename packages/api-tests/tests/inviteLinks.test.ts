import {
    OrganizationMemberProfile,
    SEED_ORG_1_ADMIN_EMAIL,
} from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { login, loginAsEditor } from '../helpers/auth';

const apiUrl = '/api/v1';

type InviteLinkResults = {
    inviteCode: string;
    expiresAt: string;
    inviteUrl: string;
    organizationUuid: string;
    userUuid: string;
    email: string;
};

type ApiError = {
    status: string;
    error: { statusCode: number; name: string; message?: string };
};

const uniqueEmail = (tag: string) =>
    `demo+invite-${tag}-${Date.now()}@lightdash.com`;

const futureExpiresAt = () =>
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

describe('Invite links endpoints', () => {
    let admin: ApiClient;
    const createdUserUuids: string[] = [];

    beforeAll(async () => {
        admin = await login();
    });

    afterAll(async () => {
        for (const userUuid of createdUserUuids) {
            await admin.delete(`${apiUrl}/org/user/${userUuid}`, {
                failOnStatusCode: false,
            });
        }
    });

    const createInvite = async (
        body: Record<string, unknown>,
        client: ApiClient = admin,
    ) => {
        const resp = await client.post<Body<InviteLinkResults>>(
            `${apiUrl}/invite-links`,
            body,
            { failOnStatusCode: false },
        );
        if (resp.status === 201) {
            createdUserUuids.push(resp.body.results.userUuid);
        }
        return resp;
    };

    describe('POST /invite-links', () => {
        it('creates an invite with email, expiresAt and role', async () => {
            const email = uniqueEmail('full');
            const expiresAt = futureExpiresAt();
            const resp = await createInvite({
                email,
                role: 'editor',
                expiresAt,
            });

            expect(resp.status).toBe(201);
            expect(resp.body.status).toBe('ok');
            const { results } = resp.body;
            expect(results.email).toBe(email);
            expect(results.expiresAt).toBe(expiresAt);
            expect(results.inviteCode).toEqual(expect.any(String));
            expect(results.inviteUrl).toContain(
                `/invite/${results.inviteCode}`,
            );
            expect(results.organizationUuid).toEqual(expect.any(String));
            expect(results.userUuid).toEqual(expect.any(String));

            const members = await admin.get<
                Body<{ data: OrganizationMemberProfile[] }>
            >(`${apiUrl}/org/users?searchQuery=${encodeURIComponent(email)}`);
            expect(members.body.results.data).toHaveLength(1);
            expect(members.body.results.data[0].role).toBe('editor');
        });

        it('defaults role to member when omitted', async () => {
            const email = uniqueEmail('default-role');
            const resp = await createInvite({
                email,
                expiresAt: futureExpiresAt(),
            });
            expect(resp.status).toBe(201);

            const members = await admin.get<
                Body<{ data: OrganizationMemberProfile[] }>
            >(`${apiUrl}/org/users?searchQuery=${encodeURIComponent(email)}`);
            expect(members.body.results.data).toHaveLength(1);
            expect(members.body.results.data[0].role).toBe('member');
        });

        it('re-inviting a pending email upserts the invite for the same user', async () => {
            const email = uniqueEmail('reinvite');
            const first = await createInvite({
                email,
                expiresAt: futureExpiresAt(),
            });
            const second = await createInvite({
                email,
                expiresAt: futureExpiresAt(),
            });

            expect(first.status).toBe(201);
            expect(second.status).toBe(201);
            expect(second.body.results.userUuid).toBe(
                first.body.results.userUuid,
            );
            expect(second.body.results.inviteCode).not.toBe(
                first.body.results.inviteCode,
            );
        });

        it('rejects an email already used by an active org member with 400', async () => {
            const resp = await createInvite({
                email: SEED_ORG_1_ADMIN_EMAIL.email,
                expiresAt: futureExpiresAt(),
            });

            expect(resp.status).toBe(400);
            const body = resp.body as unknown as ApiError;
            expect(body.error.name).toBe('ParameterError');
            expect(body.error.message).toBe(
                'Email is already used by a user in your organization',
            );
        });

        // Current behaviour: the body is not validated, so missing required
        // fields surface as database errors (500) instead of 400s
        it('returns 500 when expiresAt is missing', async () => {
            const resp = await createInvite({
                email: uniqueEmail('no-expiry'),
            });
            expect(resp.status).toBe(500);
        });

        it('returns 500 when email is missing', async () => {
            const resp = await createInvite({
                expiresAt: futureExpiresAt(),
            });
            expect(resp.status).toBe(500);
        });

        // expires_at >= created_at is enforced by a DB check constraint,
        // which also surfaces as an unhandled 500
        it('returns 500 when expiresAt is in the past', async () => {
            const resp = await createInvite({
                email: uniqueEmail('past-expiry'),
                expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
            });
            expect(resp.status).toBe(500);
        });

        it('supports personal access token authentication', async () => {
            const patResp = await admin.post<
                Body<{ token: string; uuid: string }>
            >(`${apiUrl}/user/me/personal-access-tokens`, {
                description: `invite-links-test-${Date.now()}`,
                expiresAt: null,
                autoGenerated: false,
            });
            expect(patResp.status).toBe(200);
            const { token, uuid: patUuid } = patResp.body.results;

            const patClient = new ApiClient();
            const resp = await patClient.post<Body<InviteLinkResults>>(
                `${apiUrl}/invite-links`,
                {
                    email: uniqueEmail('pat'),
                    expiresAt: futureExpiresAt(),
                },
                {
                    headers: { Authorization: `ApiKey ${token}` },
                    failOnStatusCode: false,
                },
            );
            expect(resp.status).toBe(201);
            createdUserUuids.push(resp.body.results.userUuid);

            await admin.delete(
                `${apiUrl}/user/me/personal-access-tokens/${patUuid}`,
            );
        });

        it('returns 401 when unauthenticated', async () => {
            const anonymous = new ApiClient();
            const resp = await anonymous.post(
                `${apiUrl}/invite-links`,
                {
                    email: uniqueEmail('anon'),
                    expiresAt: futureExpiresAt(),
                },
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(401);
        });

        it('returns 403 for non-admin org members', async () => {
            const editor = await loginAsEditor();
            const resp = await editor.post(
                `${apiUrl}/invite-links`,
                {
                    email: uniqueEmail('editor'),
                    expiresAt: futureExpiresAt(),
                },
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(403);
        });
    });

    describe('GET /invite-links/:inviteLinkCode', () => {
        it('returns the invite without authentication', async () => {
            const email = uniqueEmail('get');
            const created = await createInvite({
                email,
                expiresAt: futureExpiresAt(),
            });
            expect(created.status).toBe(201);

            const anonymous = new ApiClient();
            const resp = await anonymous.get<Body<InviteLinkResults>>(
                `${apiUrl}/invite-links/${created.body.results.inviteCode}`,
            );
            expect(resp.status).toBe(200);
            expect(resp.body.results.email).toBe(email);
            expect(resp.body.results.inviteCode).toBe(
                created.body.results.inviteCode,
            );
        });

        it('returns 404 for an unknown code', async () => {
            const anonymous = new ApiClient();
            const resp = await anonymous.get(
                `${apiUrl}/invite-links/unknown-code-123`,
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(404);
            expect((resp.body as ApiError).error.name).toBe('NotFoundError');
        });

        it('returns 406 for an expired code and deletes it', async () => {
            // expires_at must be >= created_at (DB check constraint), so
            // create a short-lived invite and wait for it to expire
            const created = await createInvite({
                email: uniqueEmail('expired'),
                expiresAt: new Date(Date.now() + 2 * 1000).toISOString(),
            });
            expect(created.status).toBe(201);
            const { inviteCode } = created.body.results;

            await new Promise((resolve) => {
                setTimeout(resolve, 4000);
            });

            const anonymous = new ApiClient();
            const expired = await anonymous.get(
                `${apiUrl}/invite-links/${inviteCode}`,
                { failOnStatusCode: false },
            );
            expect(expired.status).toBe(406);
            expect((expired.body as ApiError).error.name).toBe('ExpiredError');

            const afterExpiry = await anonymous.get(
                `${apiUrl}/invite-links/${inviteCode}`,
                { failOnStatusCode: false },
            );
            expect(afterExpiry.status).toBe(404);
        });
    });

    describe('DELETE /invite-links', () => {
        it('returns 403 for non-admin org members', async () => {
            const editor = await loginAsEditor();
            const resp = await editor.delete(`${apiUrl}/invite-links`, {
                failOnStatusCode: false,
            });
            expect(resp.status).toBe(403);
        });

        it('revokes all invite links in the organization', async () => {
            const created = await createInvite({
                email: uniqueEmail('revoke'),
                expiresAt: futureExpiresAt(),
            });
            expect(created.status).toBe(201);
            const { inviteCode } = created.body.results;

            const resp = await admin.delete(`${apiUrl}/invite-links`);
            expect(resp.status).toBe(200);

            const anonymous = new ApiClient();
            const afterRevoke = await anonymous.get(
                `${apiUrl}/invite-links/${inviteCode}`,
                { failOnStatusCode: false },
            );
            expect(afterRevoke.status).toBe(404);
        });
    });
});
