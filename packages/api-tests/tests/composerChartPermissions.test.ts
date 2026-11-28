import {
    ContentType,
    FeatureFlags,
    SEED_ORG_1,
    SEED_PROJECT,
    type ComposerChart,
    type ComposerChartRunResults,
    type Dashboard,
    type DashboardComposerChartRunRequest,
    type SummaryContent,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, type Body } from '../helpers/api-client';
import {
    login,
    loginAsViewer,
    loginWithEmail,
    loginWithPermissions,
} from '../helpers/auth';
import {
    apiClientSend,
    composerChartBody,
    createComposerDashboard,
    createComposerSpaceChart,
} from '../helpers/composerDashboard';
import { TestResourceTracker, uniqueName } from '../helpers/test-isolation';

const projectUuid = SEED_PROJECT.project_uuid;
const chartsUrl = `/api/v2/projects/${projectUuid}/composer-charts`;
const flagUrl = `/api/v2/feature-flag/${FeatureFlags.ComposerCharts}`;
const tileRunUrl = `/api/v2/projects/${projectUuid}/query/dashboard-composer-chart`;

const runRequest = (
    composerChartUuid: string,
    dashboardUuid: string,
    tileUuid: string,
): DashboardComposerChartRunRequest => ({
    composerChartUuid,
    dashboardUuid,
    tileUuid,
    dashboardFilters: { dimensions: [], metrics: [], tableCalculations: [] },
    parameters: {},
    excludedParameterKeys: [],
    invalidateCache: false,
});

describe('Composer chart permissions', () => {
    const tracker = new TestResourceTracker();
    let admin: ApiClient;
    let clearFlag = false;

    const createDashboard = async () => {
        const resp = await admin.post<Body<Dashboard>>(
            `/api/v1/projects/${projectUuid}/dashboards`,
            { name: uniqueName('Composer dashboard'), tiles: [], tabs: [] },
        );
        expect(resp.status).toBe(201);
        tracker.trackDashboard(resp.body.results.uuid);
        return resp.body.results;
    };

    const createChart = async (dashboardUuid: string) => {
        const resp = await admin.post<Body<ComposerChart>>(
            chartsUrl,
            composerChartBody(dashboardUuid),
        );
        expect(resp.status).toBe(201);
        return resp.body.results;
    };

    const pollRows = async (client: ApiClient, queryUuid: string) => {
        for (let attempt = 0; attempt < 120; attempt += 1) {
            const resp = await client.get<
                Body<{ status: string; rows: unknown[]; error?: string }>
            >(`/api/v2/projects/${projectUuid}/query/${queryUuid}`);
            const { status } = resp.body.results;
            if (status === 'ready') return resp.body.results.rows;
            if (status === 'error') {
                throw new Error(
                    `Node query failed: ${resp.body.results.error}`,
                );
            }
            await new Promise((resolve) => {
                setTimeout(resolve, 500);
            });
        }
        throw new Error(`Node query ${queryUuid} did not complete`);
    };

    beforeAll(async () => {
        admin = await login();
        const flag = await admin.get<Body<{ enabled: boolean }>>(flagUrl);
        if (!flag.body.results.enabled) {
            expect((await admin.post(flagUrl, { enabled: true })).status).toBe(
                200,
            );
            clearFlag = true;
        }
    });

    afterAll(async () => {
        await tracker.cleanup(admin);
        if (clearFlag) expect((await admin.delete(flagUrl)).status).toBe(200);
    });

    // Tracked before each request that could leave them behind
    const roleUuids: string[] = [];
    const userUuids: string[] = [];

    const roleUser = async (scopes: string[]): Promise<ApiClient> => {
        const role = await admin.post<Body<{ roleUuid: string }>>(
            `/api/v2/orgs/${SEED_ORG_1.organization_uuid}/roles`,
            {
                name: uniqueName('Composer chart role'),
                description: 'Composer chart permission test role',
                scopes: ['view:Project', 'view:Space', ...scopes],
            },
        );
        expect(role.status).toBe(201);
        roleUuids.push(role.body.results.roleUuid);
        const { client, email } = await loginWithPermissions('member', []);
        const user =
            await client.get<Body<{ userUuid: string }>>('/api/v1/user');
        expect(user.status).toBe(200);
        userUuids.push(user.body.results.userUuid);
        const assigned = await admin.post(
            `/api/v2/projects/${projectUuid}/roles/assignments/user/${user.body.results.userUuid}`,
            { roleId: role.body.results.roleUuid },
        );
        expect(assigned.status).toBe(200);
        return loginWithEmail(email);
    };

    // A role still assigned cannot be deleted, so every user is unassigned
    // first; an assignment a timed-out test left in flight can land late
    afterAll(async () => {
        const leftover: string[] = [];
        for (const roleUuid of roleUuids) {
            for (let attempt = 1; ; attempt += 1) {
                await Promise.all(
                    userUuids.map((userUuid) =>
                        admin.delete(
                            `/api/v2/projects/${projectUuid}/roles/assignments/user/${userUuid}`,
                            { failOnStatusCode: false },
                        ),
                    ),
                );
                const deleted = await admin.delete(
                    `/api/v2/orgs/${SEED_ORG_1.organization_uuid}/roles/${roleUuid}`,
                    { failOnStatusCode: false },
                );
                if (deleted.status === 200) break;
                if (attempt === 3) {
                    leftover.push(roleUuid);
                    break;
                }
                await new Promise((resolve) => {
                    setTimeout(resolve, 2000);
                });
            }
        }
        expect(leftover).toEqual([]);
    });

    const createViewableDashboard = async () => {
        const created = await createComposerDashboard(apiClientSend(admin));
        tracker.trackDashboard(created.dashboard.uuid);
        return {
            ...created,
            tileUuid: created.dashboard.tiles[0].uuid,
        };
    };

    it('lets a role that views charts but not dashboards read and run a dashboard chart', async () => {
        const { dashboard, chart, tileUuid } = await createViewableDashboard();
        const client = await roleUser(['view:SavedChart']);

        const read = await client.get(`${chartsUrl}/${chart.uuid}`);
        expect(read.status).toBe(200);
        const run = await client.post<Body<ComposerChartRunResults>>(
            tileRunUrl,
            runRequest(chart.uuid, dashboard.uuid, tileUuid),
        );
        expect(run.status).toBe(200);
        const [{ queryUuid }] = run.body.results.queries;
        expect((await pollRows(client, queryUuid)).length).toBeGreaterThan(0);
    });

    it('refuses a role that views dashboards but not charts, as for a classic tile', async () => {
        const { dashboard, chart, tileUuid } = await createViewableDashboard();
        const client = await roleUser(['view:Dashboard']);

        const read = await client.get(`${chartsUrl}/${chart.uuid}`, {
            failOnStatusCode: false,
        });
        expect(read.status).toBe(403);
        const run = await client.post(
            tileRunUrl,
            runRequest(chart.uuid, dashboard.uuid, tileUuid),
            { failOnStatusCode: false },
        );
        expect(run.status).toBe(403);
    });

    it('lists a space chart only for a role that views charts', async () => {
        const created = await createComposerSpaceChart(apiClientSend(admin));
        tracker.trackSpace(created.space.uuid);
        const listedFor = async (client: ApiClient) =>
            (
                await client.get<Body<{ data: SummaryContent[] }>>(
                    `/api/v2/content?projectUuids=${projectUuid}&spaceUuids=${created.space.uuid}&contentTypes=${ContentType.COMPOSER_CHART}`,
                )
            ).body.results.data.map((item) => item.uuid);

        expect(await listedFor(await roleUser(['view:Dashboard']))).toEqual([]);
        expect(await listedFor(await roleUser(['view:SavedChart']))).toEqual([
            created.chart.uuid,
        ]);
    });

    const authorScopes = [
        'view:Dashboard',
        'view:SavedChart',
        'manage:ComposerChart',
        'manage:Explore',
    ];

    it('lets a role that writes charts but not dashboards save a chart onto a dashboard', async () => {
        const dashboard = await createDashboard();
        const client = await roleUser([...authorScopes, 'manage:SavedChart']);
        const saved = await client.post(
            chartsUrl,
            composerChartBody(dashboard.uuid),
        );
        expect(saved.status).toBe(201);
    });

    it('refuses a role that writes dashboards but not charts saving a chart onto a dashboard', async () => {
        const dashboard = await createDashboard();
        const client = await roleUser([...authorScopes, 'manage:Dashboard']);
        const refused = await client.post(
            chartsUrl,
            composerChartBody(dashboard.uuid),
            { failOnStatusCode: false },
        );
        expect(refused.status).toBe(403);
    });

    it('refuses a project viewer a chart on a dashboard in a space they cannot see', async () => {
        const space = await admin.post<Body<{ uuid: string }>>(
            `/api/v1/projects/${projectUuid}/spaces`,
            {
                name: uniqueName('Composer private space'),
                inheritParentPermissions: false,
            },
        );
        expect(space.status).toBe(200);
        tracker.trackSpace(space.body.results.uuid);
        const dashboard = await admin.post<Body<Dashboard>>(
            `/api/v1/projects/${projectUuid}/dashboards`,
            {
                name: uniqueName('Composer private dashboard'),
                tiles: [],
                tabs: [],
                spaceUuid: space.body.results.uuid,
            },
        );
        expect(dashboard.status).toBe(201);
        tracker.trackDashboard(dashboard.body.results.uuid);
        const chart = await createChart(dashboard.body.results.uuid);

        const viewer = await loginAsViewer();
        const read = await viewer.get(`${chartsUrl}/${chart.uuid}`, {
            failOnStatusCode: false,
        });
        expect(read.status).toBe(403);
    });
});
