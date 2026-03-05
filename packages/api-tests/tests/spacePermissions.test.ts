import { Dashboard, SavedChart, SEED_PROJECT, Space } from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { login, loginWithEmail, loginWithPermissions } from '../helpers/auth';

const apiUrl = '/api/v1';

const chartBody = {
    tableName: 'customers',
    metricQuery: {
        dimensions: ['customers_customer_id'],
        metrics: [],
        filters: {},
        limit: 500,
        sorts: [
            {
                fieldId: 'customers_customer_id',
                descending: false,
            },
        ],
        tableCalculations: [],
        additionalMetrics: [],
    },
    tableConfig: { columnOrder: ['customers_customer_id'] },
    chartConfig: {
        type: 'cartesian',
        config: { layout: {}, eChartsConfig: {} },
    },
    name: 'private chart',
};

const dashboardBody = {
    name: 'private dashboard',
    description: '',
    tiles: [],
    tabs: [],
};

async function createPrivateChart(
    client: ApiClient,
): Promise<{ space: Space; chart: SavedChart }> {
    const spaceResp = await client.post<{ results: Space }>(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
        { name: 'private space' },
    );
    expect(spaceResp.status).toBe(200);

    const chartResp = await client.post<{ results: SavedChart }>(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
        { ...chartBody, spaceUuid: spaceResp.body.results.uuid },
    );
    expect(chartResp.status).toBe(200);

    return { space: spaceResp.body.results, chart: chartResp.body.results };
}

async function deleteSpace(client: ApiClient, spaceUuid: string) {
    const resp = await client.delete(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${spaceUuid}`,
    );
    expect(resp.status).toBe(200);
}

async function createPrivateDashboard(
    client: ApiClient,
): Promise<{ space: Space; dashboard: Dashboard }> {
    const spaceResp = await client.post<{ results: Space }>(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
        { name: 'private space' },
    );
    expect(spaceResp.status).toBe(200);

    const dashResp = await client.post<{ results: Dashboard }>(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        { ...dashboardBody, spaceUuid: spaceResp.body.results.uuid },
    );
    expect(dashResp.status).toBe(201);

    return { space: spaceResp.body.results, dashboard: dashResp.body.results };
}

describe('Lightdash API tests for my own private spaces as admin', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('Should identify user', async () => {
        const resp = await admin.get<Body<{ email: string; role: string }>>(
            `${apiUrl}/user`,
        );
        expect(resp.status).toBe(200);
        expect(resp.body.results).toHaveProperty('email', 'demo@lightdash.com');
        expect(resp.body.results).toHaveProperty('role', 'admin');
    });

    it('Should create private space', async () => {
        const resp = await admin.post<
            Body<{
                isPrivate: boolean;
                name: string;
                projectUuid: string;
                uuid: string;
            }>
        >(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`, {
            name: 'private space',
        });
        expect(resp.status).toBe(200);
        expect(resp.body.results).toHaveProperty('isPrivate', true);
        expect(resp.body.results).toHaveProperty('name', 'private space');
        expect(resp.body.results).toHaveProperty(
            'projectUuid',
            SEED_PROJECT.project_uuid,
        );

        await deleteSpace(admin, resp.body.results.uuid);
    });

    it('Should create chart in private space', async () => {
        const { space, chart } = await createPrivateChart(admin);

        expect(space).toHaveProperty('isPrivate', true);
        expect(space).toHaveProperty('name', 'private space');
        expect(chart).toHaveProperty('spaceName', 'private space');
        expect(chart).toHaveProperty('spaceUuid', space.uuid);

        await deleteSpace(admin, space.uuid);
    });

    it('Should create dashboard in private space', async () => {
        const { space, dashboard } = await createPrivateDashboard(admin);

        expect(space).toHaveProperty('isPrivate', true);
        expect(space).toHaveProperty('name', 'private space');
        expect(dashboard).toHaveProperty('spaceName', 'private space');
        expect(dashboard).toHaveProperty('spaceUuid', space.uuid);

        await deleteSpace(admin, space.uuid);
    });
});

describe('Lightdash API tests for an editor accessing other private spaces', () => {
    let admin: ApiClient;
    let editorClient: ApiClient;
    let editorEmail: string;
    let privateChart: SavedChart;
    let privateSpaceChart: Space;
    let privateSpaceDashboard: Space;
    let privateDashboard: Dashboard;

    beforeAll(async () => {
        admin = await login();

        const chartResult = await createPrivateChart(admin);
        privateChart = chartResult.chart;
        privateSpaceChart = chartResult.space;

        const dashResult = await createPrivateDashboard(admin);
        privateDashboard = dashResult.dashboard;
        privateSpaceDashboard = dashResult.space;

        const perm = await loginWithPermissions('member', [
            {
                role: 'editor',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]);
        editorEmail = perm.email;
        editorClient = perm.client;
    });

    afterAll(async () => {
        await deleteSpace(admin, privateSpaceDashboard.uuid);
        await deleteSpace(admin, privateSpaceChart.uuid);
    });

    it('Should not view charts in other private spaces', async () => {
        const resp = await editorClient.get(
            `${apiUrl}/saved/${privateChart.uuid}`,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('Should not get results from charts in other private spaces', async () => {
        const resp = await editorClient.post(
            `${apiUrl}/saved/${privateChart.uuid}/results`,
            {},
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('Should not updateMultiple charts in other private spaces', async () => {
        const resp = await editorClient.patch(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved/`,
            [
                {
                    uuid: privateChart.uuid,
                    name: 'udpated name',
                    description: 'updated description',
                    spaceUuid: privateSpaceChart.uuid,
                },
            ],
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('Should not create chart in other private spaces', async () => {
        const resp = await editorClient.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
            { ...chartBody, spaceUuid: privateSpaceChart.uuid },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('Should not toggle pinning on charts in other private spaces', async () => {
        const resp = await editorClient.patch(
            `${apiUrl}/saved/${privateChart.uuid}/pinning`,
            {},
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });

    it('Should not create scheduler for dashboard in other private spaces', async () => {
        const schedulerBody = {
            format: 'image',
            name: 'scheduler',
            cron: '0 9 * * 1',
            options: {},
            targets: [],
        };
        const resp = await editorClient.post(
            `${apiUrl}/dashboards/${privateDashboard.uuid}/schedulers`,
            schedulerBody,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(403);
    });
});

describe('Lightdash API tests for a project admin accessing other private spaces', () => {
    let admin: ApiClient;
    let projectAdminClient: ApiClient;
    let projectAdminEmail: string;
    let privateChart: SavedChart;
    let privateSpaceChart: Space;
    let privateSpaceDashboard: Space;
    let privateDashboard: Dashboard;

    beforeAll(async () => {
        admin = await login();

        const chartResult = await createPrivateChart(admin);
        privateChart = chartResult.chart;
        privateSpaceChart = chartResult.space;

        const dashResult = await createPrivateDashboard(admin);
        privateDashboard = dashResult.dashboard;
        privateSpaceDashboard = dashResult.space;

        const perm = await loginWithPermissions('viewer', [
            {
                role: 'admin',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]);
        projectAdminEmail = perm.email;
        projectAdminClient = perm.client;
    });

    afterAll(async () => {
        await deleteSpace(admin, privateSpaceDashboard.uuid);
        await deleteSpace(admin, privateSpaceChart.uuid);
    });

    it('Should list private spaces', async () => {
        const resp = await projectAdminClient.get<
            Body<Array<{ name: string }>>
        >(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(200);
        const privateSpace = resp.body.results.find(
            (space: any) => space.name === 'private space',
        );
        expect(privateSpace).toBeDefined();
    });

    it('Should list private spaces or content in global search', async () => {
        const resp = await projectAdminClient.get<
            Body<{
                spaces: Array<{ name: string }>;
                savedCharts: Array<{ name: string }>;
                dashboards: Array<{ name: string }>;
            }>
        >(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/search/private`, {
            failOnStatusCode: false,
        });
        expect(resp.status).toBe(200);
        expect(
            resp.body.results.spaces.find(
                (space: any) => space.name === 'private space',
            ),
        ).toBeDefined();
        expect(
            resp.body.results.savedCharts.find(
                (chart: any) => chart.name === 'private chart',
            ),
        ).toBeDefined();
        expect(
            resp.body.results.dashboards.find(
                (dashboard: any) => dashboard.name === 'private dashboard',
            ),
        ).toBeDefined();
    });

    it('Should not list private dashboards', async () => {
        const resp = await projectAdminClient.get<
            Body<Array<{ name: string }>>
        >(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards?includePrivate=false`,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(200);
        expect(
            resp.body.results.find(
                (dashboard: any) => dashboard.name === 'private dashboard',
            ),
        ).toBeUndefined();
    });

    it('Should view charts in other private spaces', async () => {
        const resp = await projectAdminClient.get(
            `${apiUrl}/saved/${privateChart.uuid}`,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(200);
    });

    it('Should get results from charts in other private spaces', async () => {
        const resp = await projectAdminClient.post(
            `${apiUrl}/saved/${privateChart.uuid}/results`,
            {},
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(200);
    });

    it('Should updateMultiple charts in other private spaces', async () => {
        const resp = await projectAdminClient.patch(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved/`,
            [
                {
                    uuid: privateChart.uuid,
                    name: 'udpated name',
                    description: 'updated description',
                    spaceUuid: privateSpaceChart.uuid,
                },
            ],
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(200);
    });

    it('Should create chart in other private spaces', async () => {
        const resp = await projectAdminClient.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
            { ...chartBody, spaceUuid: privateSpaceChart.uuid },
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(200);
    });

    it('Should toggle pinning on charts in other private spaces', async () => {
        const resp = await projectAdminClient.patch(
            `${apiUrl}/saved/${privateChart.uuid}/pinning`,
            {},
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(200);
    });

    it('Should create scheduler for dashboard in other private spaces', async () => {
        const schedulerBody = {
            format: 'image',
            name: 'scheduler',
            cron: '0 9 * * 1',
            options: {},
            targets: [],
        };
        const resp = await projectAdminClient.post(
            `${apiUrl}/dashboards/${privateDashboard.uuid}/schedulers`,
            schedulerBody,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(200);
    });
});
