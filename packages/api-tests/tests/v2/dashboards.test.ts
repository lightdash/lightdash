import {
    CreateDashboard,
    Dashboard,
    SEED_PROJECT,
    UpdateDashboard,
} from '@lightdash/common';
import { ApiClient } from '../../helpers/api-client';
import { login } from '../../helpers/auth';
import { dashboardMock } from '../../helpers/mocks';
import { TestResourceTracker, uniqueName } from '../../helpers/test-isolation';

const v1 = '/api/v1';
const v2 = '/api/v2';

async function createDashboardV1(
    client: ApiClient,
    projectUuid: string,
    body: CreateDashboard,
): Promise<Dashboard> {
    const resp = await client.post<{ results: Dashboard }>(
        `${v1}/projects/${projectUuid}/dashboards`,
        body,
    );
    expect(resp.status).toBe(201);
    return resp.body.results;
}

describe('V2 Project Dashboard endpoints', () => {
    let admin: ApiClient;
    const tracker = new TestResourceTracker();
    const projectUuid = SEED_PROJECT.project_uuid;

    beforeAll(async () => {
        admin = await login();
    });

    afterAll(async () => {
        await tracker.cleanup(admin);
    });

    describe('GET /api/v2/projects/:projectUuid/dashboards/:dashboardUuidOrSlug', () => {
        it('should get a dashboard by UUID', async () => {
            const created = await createDashboardV1(admin, projectUuid, {
                ...dashboardMock,
                name: uniqueName('V2 get by uuid'),
            });
            tracker.trackDashboard(created.uuid);

            const resp = await admin.get<{
                status: string;
                results: Dashboard;
            }>(`${v2}/projects/${projectUuid}/dashboards/${created.uuid}`);

            expect(resp.status).toBe(200);
            expect(resp.body.status).toBe('ok');
            expect(resp.body.results.uuid).toBe(created.uuid);
            expect(resp.body.results.name).toBe(created.name);
            expect(resp.body.results.projectUuid).toBe(projectUuid);
        });

        it('should get a dashboard by slug', async () => {
            const created = await createDashboardV1(admin, projectUuid, {
                ...dashboardMock,
                name: uniqueName('V2 get by slug'),
            });
            tracker.trackDashboard(created.uuid);

            const resp = await admin.get<{
                status: string;
                results: Dashboard;
            }>(`${v2}/projects/${projectUuid}/dashboards/${created.slug}`);

            expect(resp.status).toBe(200);
            expect(resp.body.results.uuid).toBe(created.uuid);
            expect(resp.body.results.slug).toBe(created.slug);
        });

        it('should get the seed jaffle-dashboard by slug', async () => {
            const resp = await admin.get<{
                status: string;
                results: Dashboard;
            }>(`${v2}/projects/${projectUuid}/dashboards/jaffle-dashboard`);

            expect(resp.status).toBe(200);
            expect(resp.body.results.name).toBe('Jaffle dashboard');
            expect(resp.body.results.slug).toBe('jaffle-dashboard');
        });

        it('should return 404 for a non-existent dashboard', async () => {
            const resp = await admin.get(
                `${v2}/projects/${projectUuid}/dashboards/non-existent-uuid`,
                { failOnStatusCode: false },
            );

            expect(resp.ok).toBe(false);
        });
    });

    describe('PATCH /api/v2/projects/:projectUuid/dashboards/:dashboardUuidOrSlug', () => {
        it('should update a dashboard name and description', async () => {
            const created = await createDashboardV1(admin, projectUuid, {
                ...dashboardMock,
                name: uniqueName('V2 update test'),
            });
            tracker.trackDashboard(created.uuid);

            const updatedName = uniqueName('V2 updated name');
            const update: UpdateDashboard = {
                name: updatedName,
                description: 'Updated via V2 API',
            };

            const resp = await admin.patch<{
                status: string;
                results: Dashboard;
            }>(
                `${v2}/projects/${projectUuid}/dashboards/${created.uuid}`,
                update,
            );

            expect(resp.status).toBe(200);
            expect(resp.body.status).toBe('ok');
            expect(resp.body.results.name).toBe(updatedName);
            expect(resp.body.results.description).toBe('Updated via V2 API');
        });

        it('should update a dashboard by slug', async () => {
            const created = await createDashboardV1(admin, projectUuid, {
                ...dashboardMock,
                name: uniqueName('V2 update by slug'),
            });
            tracker.trackDashboard(created.uuid);

            const updatedName = uniqueName('V2 slug updated');
            const update: UpdateDashboard = {
                name: updatedName,
                description: 'Updated by slug via V2',
            };

            const resp = await admin.patch<{
                status: string;
                results: Dashboard;
            }>(
                `${v2}/projects/${projectUuid}/dashboards/${created.slug}`,
                update,
            );

            expect(resp.status).toBe(200);
            expect(resp.body.results.description).toBe(
                'Updated by slug via V2',
            );
            expect(resp.body.results.uuid).toBe(created.uuid);
        });
    });

    describe('DELETE /api/v2/projects/:projectUuid/dashboards/:dashboardUuidOrSlug', () => {
        it('should delete a dashboard by UUID', async () => {
            const created = await createDashboardV1(admin, projectUuid, {
                ...dashboardMock,
                name: uniqueName('V2 delete test'),
            });

            const resp = await admin.delete<{
                status: string;
                results: undefined;
            }>(`${v2}/projects/${projectUuid}/dashboards/${created.uuid}`);

            expect(resp.status).toBe(200);
            expect(resp.body.status).toBe('ok');

            // Verify it's deleted
            const getResp = await admin.get(
                `${v2}/projects/${projectUuid}/dashboards/${created.uuid}`,
                { failOnStatusCode: false },
            );
            expect(getResp.ok).toBe(false);
        });

        it('should delete a dashboard by slug', async () => {
            const created = await createDashboardV1(admin, projectUuid, {
                ...dashboardMock,
                name: uniqueName('V2 delete by slug'),
            });

            const resp = await admin.delete<{
                status: string;
                results: undefined;
            }>(`${v2}/projects/${projectUuid}/dashboards/${created.slug}`);

            expect(resp.status).toBe(200);

            // Verify it's deleted
            const getResp = await admin.get(
                `${v2}/projects/${projectUuid}/dashboards/${created.uuid}`,
                { failOnStatusCode: false },
            );
            expect(getResp.ok).toBe(false);
        });
    });

    describe('GET /api/v2/projects/:projectUuid/dashboards/:dashboardUuidOrSlug/comments', () => {
        it('should get comments for a dashboard (empty by default)', async () => {
            const created = await createDashboardV1(admin, projectUuid, {
                ...dashboardMock,
                name: uniqueName('V2 comments test'),
            });
            tracker.trackDashboard(created.uuid);

            const resp = await admin.get<{
                status: string;
                results: Record<string, unknown[]>;
            }>(
                `${v2}/projects/${projectUuid}/dashboards/${created.uuid}/comments`,
            );

            expect(resp.status).toBe(200);
            expect(resp.body.status).toBe('ok');
            expect(typeof resp.body.results).toBe('object');
        });
    });

    describe('V1 and V2 parity', () => {
        it('should return the same dashboard data from V1 and V2', async () => {
            const created = await createDashboardV1(admin, projectUuid, {
                ...dashboardMock,
                name: uniqueName('V2 parity test'),
            });
            tracker.trackDashboard(created.uuid);

            const v1Resp = await admin.get<{ results: Dashboard }>(
                `${v1}/dashboards/${created.uuid}`,
            );
            const v2Resp = await admin.get<{ results: Dashboard }>(
                `${v2}/projects/${projectUuid}/dashboards/${created.uuid}`,
            );

            expect(v1Resp.status).toBe(200);
            expect(v2Resp.status).toBe(200);
            expect(v1Resp.body.results.uuid).toBe(v2Resp.body.results.uuid);
            expect(v1Resp.body.results.name).toBe(v2Resp.body.results.name);
            expect(v1Resp.body.results.tiles).toEqual(
                v2Resp.body.results.tiles,
            );
            expect(v1Resp.body.results.filters).toEqual(
                v2Resp.body.results.filters,
            );
        });
    });
});
