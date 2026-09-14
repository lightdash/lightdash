import {
    ChartAsCode,
    ChartType,
    DashboardAsCode,
    getContentAsCodePathFromLtreePath,
    SEED_PROJECT,
    Space,
    SpaceMemberRole,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { ApiClient, Body } from '../helpers/api-client';
import { login, loginWithPermissions } from '../helpers/auth';

const projectUuid = SEED_PROJECT.project_uuid;
const projectsUrl = `/api/v1/projects/${projectUuid}`;

describe('Content-as-code upload space permissions', () => {
    let admin: ApiClient;
    let source: Space;
    let destination: Space;
    const clients = new Map<string, { client: ApiClient; userUuid: string }>();

    beforeAll(async () => {
        admin = await login();
        const adminUser =
            await admin.get<Body<{ userUuid: string }>>('/api/v1/user');
        clients.set('admin', {
            client: admin,
            userUuid: adminUser.body.results.userUuid,
        });
        for (const name of ['source', 'destination']) {
            const response = await admin.post<Body<Space>>(
                `${projectsUrl}/spaces`,
                { name: `Upload permissions ${name} ${randomUUID()}` },
            );
            if (name === 'source') source = response.body.results;
            else destination = response.body.results;
        }
        for (const role of ['developer', 'editor']) {
            const { client } = await loginWithPermissions('member', [
                { projectUuid, role },
            ]);
            const user =
                await client.get<Body<{ userUuid: string }>>('/api/v1/user');
            clients.set(role, { client, userUuid: user.body.results.userUuid });
        }
    }, 60_000);

    afterAll(async () => {
        for (const space of [source, destination]) {
            if (space)
                await admin.delete(`${projectsUrl}/spaces/${space.uuid}`);
        }
    });

    const grant = async (
        role: string,
        space: Space,
        spaceRole: SpaceMemberRole,
    ) => {
        await admin.post(`${projectsUrl}/spaces/${space.uuid}/share`, {
            userUuid: clients.get(role)!.userUuid,
            spaceRole,
        });
    };

    const payload = (
        type: 'charts' | 'dashboards',
        space: Space,
        slug = `upload-permissions-${randomUUID()}`,
    ): ChartAsCode | DashboardAsCode => {
        const base = {
            name: slug,
            slug,
            description: 'Upload permission regression',
            spaceSlug: getContentAsCodePathFromLtreePath(space.path),
            version: 1,
        };
        if (type === 'dashboards') {
            return { ...base, tiles: [], tabs: [] };
        }
        return {
            ...base,
            dashboardSlug: undefined,
            tableName: 'customers',
            metricQuery: {
                exploreName: 'customers',
                dimensions: ['customers_customer_id'],
                metrics: [],
                filters: {},
                sorts: [],
                limit: 10,
                tableCalculations: [],
            },
            chartConfig: { type: ChartType.TABLE, config: {} },
        };
    };

    const upload = (
        client: ApiClient,
        type: 'charts' | 'dashboards',
        content: ChartAsCode | DashboardAsCode,
    ) =>
        client.post(`${projectsUrl}/code/${type}/${content.slug}`, content, {
            failOnStatusCode: false,
        });

    describe.each(['developer', 'editor'])('%s', (role) => {
        describe.each(['charts', 'dashboards'] as const)('%s', (type) => {
            it('cannot create content with Can View access', async () => {
                await grant(role, source, SpaceMemberRole.VIEWER);
                const response = await upload(
                    clients.get(role)!.client,
                    type,
                    payload(type, source),
                );
                expect(response.status).toBe(403);
            });

            it('can download but cannot overwrite with Can View access', async () => {
                await grant(role, source, SpaceMemberRole.VIEWER);
                const content = payload(type, source);
                expect((await upload(admin, type, content)).status).toBe(200);
                const { client } = clients.get(role)!;
                const download = await client.get(
                    `${projectsUrl}/code/${type}?ids=${content.slug}`,
                );
                expect(download.status).toBe(200);
                const response = await upload(client, type, {
                    ...content,
                    description: 'Unauthorized overwrite',
                    updatedAt: new Date(),
                });
                expect(response.status).toBe(403);
            });

            it('cannot move content out of a Can View source', async () => {
                await grant(role, source, SpaceMemberRole.VIEWER);
                await grant(role, destination, SpaceMemberRole.EDITOR);
                const content = payload(type, source);
                expect((await upload(admin, type, content)).status).toBe(200);
                const response = await upload(clients.get(role)!.client, type, {
                    ...content,
                    spaceSlug: getContentAsCodePathFromLtreePath(
                        destination.path,
                    ),
                    updatedAt: new Date(),
                });
                expect(response.status).toBe(403);
            });

            it('cannot move content into a Can View destination', async () => {
                await grant(role, source, SpaceMemberRole.EDITOR);
                await grant(role, destination, SpaceMemberRole.VIEWER);
                const content = payload(type, source);
                expect((await upload(admin, type, content)).status).toBe(200);
                const response = await upload(clients.get(role)!.client, type, {
                    ...content,
                    spaceSlug: getContentAsCodePathFromLtreePath(
                        destination.path,
                    ),
                    updatedAt: new Date(),
                });
                expect(response.status).toBe(403);
            });

            it('cannot auto-create a child under a Can View ancestor', async () => {
                await grant(role, source, SpaceMemberRole.VIEWER);
                const content = payload(type, source);
                const response = await upload(clients.get(role)!.client, type, {
                    ...content,
                    spaceSlug: `${content.spaceSlug}/denied-${randomUUID()}`,
                });
                expect(response.status).toBe(403);
                const parent = await admin.get<Body<Space>>(
                    `${projectsUrl}/spaces/${source.uuid}`,
                );
                expect(parent.body.results.childSpaces).toHaveLength(0);
            });

            it('cannot move content into a missing child of a Can View ancestor', async () => {
                await grant(role, source, SpaceMemberRole.EDITOR);
                await grant(role, destination, SpaceMemberRole.VIEWER);
                const content = payload(type, source);
                expect((await upload(admin, type, content)).status).toBe(200);
                const response = await upload(clients.get(role)!.client, type, {
                    ...content,
                    spaceSlug: `${getContentAsCodePathFromLtreePath(destination.path)}/denied-${randomUUID()}`,
                    updatedAt: new Date(),
                });
                expect(response.status).toBe(403);
                const parent = await admin.get<Body<Space>>(
                    `${projectsUrl}/spaces/${destination.uuid}`,
                );
                expect(parent.body.results.childSpaces).toHaveLength(0);
            });

            it('can create and update content with Can Edit access', async () => {
                await grant(role, source, SpaceMemberRole.EDITOR);
                const { client } = clients.get(role)!;
                const content = payload(type, source);
                expect((await upload(client, type, content)).status).toBe(200);
                expect(
                    (
                        await upload(client, type, {
                            ...content,
                            description: 'Authorized overwrite',
                            updatedAt: new Date(),
                        })
                    ).status,
                ).toBe(200);
            });
        });
    });

    it.each(['charts', 'dashboards'] as const)(
        'admins retain upload access to restricted spaces (%s)',
        async (type) => {
            await grant('admin', source, SpaceMemberRole.VIEWER);
            const content = payload(type, source);
            expect((await upload(admin, type, content)).status).toBe(200);
            expect(
                (
                    await upload(admin, type, {
                        ...content,
                        description: 'Admin overwrite',
                        updatedAt: new Date(),
                    })
                ).status,
            ).toBe(200);
        },
    );
});
