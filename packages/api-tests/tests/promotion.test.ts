import {
    CreateWarehouseCredentials,
    DashboardTileTypes,
    isDashboardVersionedFields,
    SEED_PROJECT,
    WarehouseTypes,
} from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { chartMock } from '../helpers/mocks';

const apiUrl = '/api/v1';

const postgresWarehouseConfig: CreateWarehouseCredentials = {
    host: process.env.PGHOST || 'db-dev',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'password',
    dbname: 'postgres',
    schema: 'jaffle',
    port: 5432,
    sslmode: 'disable',
    type: WarehouseTypes.POSTGRES,
};

// --- Helper functions ---

async function createProject(
    client: ApiClient,
    projectName: string,
    warehouseConfig: CreateWarehouseCredentials,
): Promise<string> {
    const resp = await client.post<Body<{ project: { projectUuid: string } }>>(
        '/api/v1/org/projects',
        {
            name: projectName,
            type: 'DEFAULT',
            dbtConnection: {
                target: '',
                environment: [],
                type: 'dbt',
                project_dir: process.env.DBT_PROJECT_DIR,
            },
            dbtVersion: 'v1.7',
            warehouseConnection: warehouseConfig,
        },
    );
    expect(resp.status).toBe(200);
    return resp.body.results.project.projectUuid;
}

async function deleteProjectsByName(
    client: ApiClient,
    names: string[],
): Promise<void> {
    const resp = await client.get<
        Body<Array<{ projectUuid: string; name: string }>>
    >('/api/v1/org/projects');
    expect(resp.status).toBe(200);
    for (const { projectUuid, name } of resp.body.results) {
        if (names.includes(name)) {
            const deleteResp = await client.delete<Body<unknown>>(
                `/api/v1/org/projects/${projectUuid}`,
            );
            expect(deleteResp.status).toBe(200);
        }
    }
}

async function createSpace(
    client: ApiClient,
    projectUuid: string,
    spaceName: string,
): Promise<string> {
    const resp = await client.post<Body<{ uuid: string }>>(
        `/api/v1/projects/${projectUuid}/spaces/`,
        { name: spaceName, isPrivate: false },
    );
    expect(resp.status).toBe(200);
    return resp.body.results.uuid;
}

async function createChartInSpace(
    client: ApiClient,
    projectUuid: string,
    body: Record<string, unknown>,
): Promise<{
    uuid: string;
    name: string;
    spaceName: string;
    organizationUuid: string;
    projectUuid: string;
    spaceUuid: string;
}> {
    const resp = await client.post<
        Body<{
            uuid: string;
            name: string;
            spaceName: string;
            organizationUuid: string;
            projectUuid: string;
            spaceUuid: string;
        }>
    >(`/api/v1/projects/${projectUuid}/saved`, body);
    expect(resp.status).toBe(200);
    return resp.body.results;
}

async function createDashboard(
    client: ApiClient,
    projectUuid: string,
    body: Record<string, unknown>,
): Promise<any> {
    const resp = await client.post<Body<any>>(
        `/api/v1/projects/${projectUuid}/dashboards`,
        body,
    );
    expect(resp.status).toBe(201);
    return resp.body.results;
}

async function updateDashboard(
    client: ApiClient,
    dashboardUuid: string,
    body: Record<string, unknown>,
): Promise<any> {
    const resp = await client.patch<Body<any>>(
        `/api/v1/dashboards/${dashboardUuid}`,
        body,
    );
    expect(resp.status).toBe(200);
    return resp.body.results;
}

async function createChartAndUpdateDashboard(
    client: ApiClient,
    projectUuid: string,
    chartBody: Record<string, unknown>,
    dashboard?: Record<string, unknown>,
): Promise<{ chart: any; dashboard: any }> {
    const chartResp = await client.post<
        Body<{ uuid: string; name: string; dashboardUuid: string | null }>
    >(`/api/v1/projects/${projectUuid}/saved`, chartBody);
    expect(chartResp.status).toBe(200);
    const newChart = chartResp.body.results;
    expect(newChart.name).toBe(chartBody.name);
    expect(newChart.dashboardUuid).toBe(chartBody.dashboardUuid);

    const updatedDashboard = await updateDashboard(
        client,
        chartBody.dashboardUuid as string,
        {
            ...dashboard,
            tabs: [],
            tiles: [
                ...(dashboard && isDashboardVersionedFields(dashboard as any)
                    ? (dashboard as any).tiles
                    : []),
                {
                    tabUuid: undefined,
                    type: DashboardTileTypes.SAVED_CHART,
                    x: 0,
                    y: 0,
                    h: 5,
                    w: 5,
                    properties: {
                        savedChartUuid: newChart.uuid,
                    },
                },
            ],
        },
    );
    return { chart: newChart, dashboard: updatedDashboard };
}

// --- Assertion helpers ---

function checkPromotedChart(
    promotedChart: Record<string, any>,
    upstreamChart: Record<string, any>,
) {
    const equalProperties = ['name', 'spaceName', 'organizationUuid'];
    for (const prop of equalProperties) {
        expect(promotedChart[prop]).toBe(upstreamChart[prop]);
    }

    const notEqualProperties = ['uuid', 'projectUuid', 'spaceUuid'];
    for (const prop of notEqualProperties) {
        expect(promotedChart[prop]).not.toBe(upstreamChart[prop]);
    }
}

function checkPromotedDashboard(
    promotedDashboard: Record<string, any>,
    upstreamDashboard: Record<string, any>,
) {
    const equalProperties = ['name', 'spaceName', 'organizationUuid'];
    for (const prop of equalProperties) {
        expect(promotedDashboard[prop]).toBe(upstreamDashboard[prop]);
    }

    if (promotedDashboard.tiles) {
        expect(promotedDashboard.tiles.length).toBe(
            upstreamDashboard.tiles.length,
        );

        promotedDashboard.tiles.forEach((promotedTile: any, index: number) => {
            const upstreamTile = upstreamDashboard.tiles[index];
            expect(promotedTile.type).toBe(upstreamTile.type);
            expect(promotedTile.properties.chartName).toBe(
                upstreamTile.properties.chartName,
            );

            // Chart in dashboards should not have the same chart uuid
            if (promotedTile.properties.savedChartUuid !== undefined) {
                expect(promotedTile.properties.savedChartUuid).not.toBe(
                    upstreamTile.properties.savedChartUuid,
                );
            } else {
                // Charts in space should have the `savedChartUuid` property set to null
                expect(promotedTile.properties.savedChartUuid).toBe(
                    upstreamTile.properties.savedChartUuid,
                );
            }
        });
    }

    const notEqualProperties = ['uuid', 'projectUuid', 'spaceUuid'];
    for (const prop of notEqualProperties) {
        expect(promotedDashboard[prop]).not.toBe(upstreamDashboard[prop]);
    }
}

// --- Tests ---

describe('Promotion charts and dashboards', () => {
    const upstreamProjectName = `Upstream project ${Date.now()}`;
    let upstreamProjectUuid: string;
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();

        // Create upstream project
        upstreamProjectUuid = await createProject(
            admin,
            upstreamProjectName,
            postgresWarehouseConfig,
        );
    });

    afterAll(async () => {
        // Delete upstream project
        await deleteProjectsByName(admin, [upstreamProjectName]);
    });

    it('Set upstream project on seed project', async () => {
        const resp = await admin.patch(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/metadata`,
            { upstreamProjectUuid },
        );
        expect(resp.status).toBe(200);
    });

    it('Promote existing chart in space', async () => {
        const chartsResp = await admin.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`);
        expect(chartsResp.status).toBe(200);
        expect(chartsResp.body.results.length).toBeGreaterThan(0);

        const chart = chartsResp.body.results.find(
            (c) => c.name === 'How many orders we have over time ?',
        );

        const promoteResp = await admin.post<Body<Record<string, any>>>(
            `${apiUrl}/saved/${chart!.uuid}/promote`,
        );
        expect(promoteResp.status).toBe(200);
        const upstreamChart = promoteResp.body.results;
        checkPromotedChart(chart!, upstreamChart);

        // Promote again
        const promoteAgainResp = await admin.post(
            `${apiUrl}/saved/${chart!.uuid}/promote`,
        );
        expect(promoteAgainResp.status).toBe(200);
    });

    it('Promote new chart in new space', async () => {
        const now = Date.now();
        const spaceUuid = await createSpace(
            admin,
            SEED_PROJECT.project_uuid,
            `Public space to promote ${now}`,
        );

        const chart = await createChartInSpace(
            admin,
            SEED_PROJECT.project_uuid,
            {
                ...chartMock,
                name: `Chart to promote ${now}`,
                spaceUuid,
                dashboardUuid: null,
            },
        );

        const promoteResp = await admin.post<Body<Record<string, any>>>(
            `${apiUrl}/saved/${chart.uuid}/promote`,
        );
        expect(promoteResp.status).toBe(200);
        const upstreamChart = promoteResp.body.results;
        checkPromotedChart(chart, upstreamChart);

        // Promote again
        const promoteAgainResp = await admin.post(
            `${apiUrl}/saved/${chart.uuid}/promote`,
        );
        expect(promoteAgainResp.status).toBe(200);
    });

    it('Promote existing dashboard in space', async () => {
        const dashboardsResp = await admin.get<
            Body<Array<{ uuid: string; name: string }>>
        >(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        expect(dashboardsResp.status).toBe(200);
        expect(dashboardsResp.body.results.length).toBeGreaterThan(0);

        const dashboard = dashboardsResp.body.results.find(
            (c) => c.name === 'Jaffle dashboard',
        );

        const promoteResp = await admin.post<Body<Record<string, any>>>(
            `${apiUrl}/dashboards/${dashboard!.uuid}/promote`,
        );
        expect(promoteResp.status).toBe(200);
        const upstreamDashboard = promoteResp.body.results;

        checkPromotedDashboard(
            {
                spaceName: 'Jaffle shop', // not returned in the list of dashboards
                ...dashboard!,
            },
            upstreamDashboard,
        );

        // Promote again
        const promoteAgainResp = await admin.post(
            `${apiUrl}/dashboards/${dashboard!.uuid}/promote`,
        );
        expect(promoteAgainResp.status).toBe(200);
    });

    it('Promote new dashboard', async () => {
        // Steps:
        // 1. Create a new space
        // 2. Create a new chart in the space
        // 3. Create a new dashboard with the chart
        // 4. Create chart within dashboard
        // 5. Promote the dashboard
        const now = Date.now();
        const projectUuid = SEED_PROJECT.project_uuid;

        const spaceUuid = await createSpace(
            admin,
            projectUuid,
            `Public space to promote ${now}`,
        );

        const chart = await createChartInSpace(admin, projectUuid, {
            ...chartMock,
            name: `Chart to promote ${now}`,
            spaceUuid,
            dashboardUuid: null,
        });

        const newDashboard = await createDashboard(admin, projectUuid, {
            name: `Dashboard to promote ${now}`,
            tiles: [
                {
                    tabUuid: undefined,
                    type: DashboardTileTypes.SAVED_CHART,
                    x: 0,
                    y: 0,
                    h: 5,
                    w: 5,
                    properties: {
                        savedChartUuid: chart.uuid,
                    },
                },
            ],
            tabs: [],
        });
        expect(newDashboard.tiles.length).toBe(1);

        const { dashboard: updatedDashboard } =
            await createChartAndUpdateDashboard(
                admin,
                projectUuid,
                {
                    ...chartMock,
                    name: `Chart in dashboard to promote ${now}`,
                    dashboardUuid: newDashboard.uuid,
                    spaceUuid: null,
                },
                newDashboard,
            );
        expect(updatedDashboard.tiles.length).toBe(2);

        const promoteResp = await admin.post<Body<Record<string, any>>>(
            `${apiUrl}/dashboards/${updatedDashboard.uuid}/promote`,
        );
        expect(promoteResp.status).toBe(200);
        const upstreamDashboard = promoteResp.body.results;
        checkPromotedDashboard(updatedDashboard, upstreamDashboard);

        // Promote again
        const promoteAgainResp = await admin.post(
            `${apiUrl}/dashboards/${updatedDashboard.uuid}/promote`,
        );
        expect(promoteAgainResp.status).toBe(200);
    });
});
