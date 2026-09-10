import {
    SEED_ORG_1_EDITOR,
    SEED_ORG_1_VIEWER,
    SEED_PROJECT,
    ServiceAccount,
    ServiceAccountScope,
    Space,
    SpaceShare,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { ApiClient, Body } from '../helpers/api-client';
import {
    anotherLogin,
    login,
    loginAsEditor,
    loginAsViewer,
} from '../helpers/auth';
import { uniqueName } from '../helpers/test-isolation';

const spacesUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}/spaces`;
const accountsUrl = '/api/v1/service-accounts';
const allowFailure = { failOnStatusCode: false };

describe('Direct service account access to restricted spaces', () => {
    let admin: ApiClient;
    let editor: ApiClient;
    let viewer: ApiClient;
    let otherAdmin: ApiClient;
    const spaces: string[] = [];
    const accounts: { client: ApiClient; uuid: string }[] = [];

    const createSpace = async (parentSpaceUuid?: string) => {
        const response = await admin.post<Body<Space>>(spacesUrl, {
            name: uniqueName('service-account-sharing'),
            inheritParentPermissions: Boolean(parentSpaceUuid),
            parentSpaceUuid,
        });
        spaces.push(response.body.results.uuid);
        return response.body.results;
    };

    const createAccount = async (
        client = admin,
        scope = ServiceAccountScope.SYSTEM_EDITOR,
    ) => {
        const description = uniqueName('space-sharing-account');
        const response = await client.post<Body<{ token: string }>>(
            accountsUrl,
            {
                description,
                scopes: [scope],
                ...(scope === ServiceAccountScope.SYSTEM_MEMBER
                    ? {
                          projectAccess: [
                              {
                                  projectUuid: SEED_PROJECT.project_uuid,
                                  role: 'editor',
                              },
                          ],
                      }
                    : {}),
                expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            },
        );
        const listing = await client.get<Body<ServiceAccount[]>>(accountsUrl);
        const account = listing.body.results.find(
            (candidate) => candidate.description === description,
        );
        if (!account) {
            throw new Error('Created service account was absent from listing');
        }
        accounts.push({ client, uuid: account.uuid });
        return {
            ...account,
            options: {
                ...allowFailure,
                headers: {
                    Authorization: `Bearer ${response.body.results.token}`,
                },
            },
        };
    };

    beforeAll(async () => {
        [admin, editor, viewer, otherAdmin] = await Promise.all([
            login(),
            loginAsEditor(),
            loginAsViewer(),
            anotherLogin(),
        ]);
    });

    afterAll(async () => {
        for (const spaceUuid of [...spaces].reverse()) {
            await admin.delete(`${spacesUrl}/${spaceUuid}`, allowFailure);
        }
        for (const account of accounts) {
            await account.client.delete(
                `${accountsUrl}/${account.uuid}`,
                allowFailure,
            );
        }
    });

    it.each(['viewer', 'editor', 'admin'] as const)(
        'applies the %s grant, inherits into children, and revokes access',
        async (spaceRole) => {
            const account = await createAccount();
            const space = await createSpace();
            const child = await createSpace(space.uuid);
            const sibling = await createSpace();
            const path = `${spacesUrl}/${space.uuid}`;
            const serviceClient = new ApiClient();

            expect(
                (await serviceClient.get(path, account.options)).status,
            ).toBe(403);
            await admin.post(`${path}/share`, {
                userUuid: account.userUuid,
                spaceRole,
            });
            expect(
                (await serviceClient.get(path, account.options)).status,
            ).toBe(200);
            expect(
                (
                    await serviceClient.get(
                        `${spacesUrl}/${child.uuid}`,
                        account.options,
                    )
                ).status,
            ).toBe(200);
            expect(
                (
                    await serviceClient.get(
                        `${spacesUrl}/${sibling.uuid}`,
                        account.options,
                    )
                ).status,
            ).toBe(403);

            const access = await admin.get<Body<{ data: SpaceShare[] }>>(
                `${path}/access?directOnly=true`,
            );
            expect(access.body.results.data).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        userUuid: account.userUuid,
                        role: spaceRole,
                        isInternal: true,
                        firstName: account.description,
                    }),
                ]),
            );

            const dashboard = await serviceClient.post(
                `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`,
                {
                    name: uniqueName('service-account-dashboard'),
                    description: '',
                    tiles: [],
                    tabs: [],
                    spaceUuid: space.uuid,
                },
                account.options,
            );
            expect(dashboard.status).toBe(spaceRole === 'viewer' ? 403 : 201);

            const manage = await serviceClient.post(
                `${path}/share`,
                { userUuid: SEED_ORG_1_VIEWER.user_uuid, spaceRole: 'viewer' },
                account.options,
            );
            expect(manage.status).toBe(spaceRole === 'admin' ? 200 : 403);

            await admin.post(`${path}/share`, {
                userUuid: account.userUuid,
                spaceRole: 'viewer',
            });
            const updated = await admin.get<Body<{ data: SpaceShare[] }>>(
                `${path}/access?directOnly=true`,
            );
            expect(
                updated.body.results.data.find(
                    (row) => row.userUuid === account.userUuid,
                )?.role,
            ).toBe('viewer');
            await admin.delete(`${path}/share/${account.userUuid}`);
            expect(
                (await serviceClient.get(path, account.options)).status,
            ).toBe(403);
            expect(
                (
                    await serviceClient.get(
                        `${spacesUrl}/${child.uuid}`,
                        account.options,
                    )
                ).status,
            ).toBe(403);
        },
    );

    it('allows a human space manager to discover minimal candidates without exposing them in the human directory', async () => {
        const account = await createAccount();
        const space = await createSpace();
        const path = `${spacesUrl}/${space.uuid}`;
        await admin.post(`${path}/share`, {
            userUuid: SEED_ORG_1_EDITOR.user_uuid,
            spaceRole: 'admin',
        });
        await admin.post(`${path}/share`, {
            userUuid: SEED_ORG_1_VIEWER.user_uuid,
            spaceRole: 'viewer',
        });
        expect((await editor.get(accountsUrl, allowFailure)).status).toBe(403);
        const candidates = await editor.get<
            Body<Pick<ServiceAccount, 'userUuid' | 'description'>[]>
        >(`${path}/share/service-accounts`);
        expect(candidates.body.results).toContainEqual({
            userUuid: account.userUuid,
            description: account.description,
        });
        candidates.body.results.forEach((candidate) => {
            expect(Object.keys(candidate).sort()).toEqual([
                'description',
                'userUuid',
            ]);
        });
        expect(
            (await viewer.get(`${path}/share/service-accounts`, allowFailure))
                .status,
        ).toBe(403);
        const users = await admin.get<Body<{ data: { userUuid: string }[] }>>(
            `/api/v1/org/users?searchQuery=${encodeURIComponent(account.description)}`,
        );
        expect(users.body.results.data).toEqual([]);
    });

    it('rejects foreign, deleted, and missing recipients without adding grants', async () => {
        const foreign = await createAccount(otherAdmin);
        const deleted = await createAccount();
        await admin.delete(`${accountsUrl}/${deleted.uuid}`);
        const space = await createSpace();
        const path = `${spacesUrl}/${space.uuid}`;
        const before = await admin.get<Body<{ data: SpaceShare[] }>>(
            `${path}/access?directOnly=true`,
        );
        for (const userUuid of [
            foreign.userUuid,
            deleted.userUuid,
            randomUUID(),
        ]) {
            const response = await admin.post(
                `${path}/share`,
                { userUuid, spaceRole: 'viewer' },
                allowFailure,
            );
            expect(response.status).toBe(404);
        }
        const after = await admin.get<Body<{ data: SpaceShare[] }>>(
            `${path}/access?directOnly=true`,
        );
        expect(after.body.results.data).toEqual(before.body.results.data);
        const candidates = await admin.get<Body<{ userUuid: string }[]>>(
            `${path}/share/service-accounts`,
        );
        expect(
            candidates.body.results.map((row) => row.userUuid),
        ).not.toContain(foreign.userUuid);
        expect(
            candidates.body.results.map((row) => row.userUuid),
        ).not.toContain(deleted.userUuid);
    });

    it('does not discover candidates through a mismatched project or missing space', async () => {
        const space = await createSpace();
        const paths = [
            `/api/v1/projects/${randomUUID()}/spaces/${space.uuid}/share/service-accounts`,
            `${spacesUrl}/${randomUUID()}/share/service-accounts`,
        ];
        for (const path of paths) {
            expect((await admin.get(path, allowFailure)).status).toBe(404);
        }
    });

    it('allows direct sharing with a project-scoped service account', async () => {
        const account = await createAccount(
            admin,
            ServiceAccountScope.SYSTEM_MEMBER,
        );
        const space = await createSpace();
        const path = `${spacesUrl}/${space.uuid}`;
        const serviceClient = new ApiClient();
        expect((await serviceClient.get(path, account.options)).status).toBe(
            403,
        );
        await admin.post(`${path}/share`, {
            userUuid: account.userUuid,
            spaceRole: 'viewer',
        });
        expect((await serviceClient.get(path, account.options)).status).toBe(
            200,
        );
    });

    it('does not let a space admin grant override the account viewer capability limit', async () => {
        const account = await createAccount(
            admin,
            ServiceAccountScope.SYSTEM_VIEWER,
        );
        const space = await createSpace();
        const path = `${spacesUrl}/${space.uuid}`;
        await admin.post(`${path}/share`, {
            userUuid: account.userUuid,
            spaceRole: 'admin',
        });
        const serviceClient = new ApiClient();
        expect((await serviceClient.get(path, account.options)).status).toBe(
            200,
        );
        const sharing = await serviceClient.post(
            `${path}/share`,
            { userUuid: SEED_ORG_1_VIEWER.user_uuid, spaceRole: 'viewer' },
            account.options,
        );
        expect(sharing.status).toBe(403);
    });
});
