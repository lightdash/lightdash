import {
    ApiChartSummaryListResponse,
    CreateChartInDashboard,
    CreateDashboard,
    Dashboard,
    DashboardChartTile,
    DashboardTile,
    DashboardTileTypes,
    isDashboardVersionedFields,
    SavedChart,
    SEED_PROJECT,
    UpdateDashboard,
} from '@lightdash/common';
import { ApiClient } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { chartMock, dashboardMock } from '../helpers/mocks';

const apiUrl = '/api/v1';

export async function createDashboard(
    client: ApiClient,
    projectUuid: string,
    body: CreateDashboard,
): Promise<Dashboard> {
    const response = await client.post<{ results: Dashboard }>(
        `${apiUrl}/projects/${projectUuid}/dashboards`,
        body,
    );
    expect(response.status).toBe(201);
    return response.body.results;
}

async function updateDashboard(
    client: ApiClient,
    dashboardUuid: string,
    body: UpdateDashboard,
): Promise<Dashboard> {
    const response = await client.patch<{ results: Dashboard }>(
        `${apiUrl}/dashboards/${dashboardUuid}`,
        body,
    );
    expect(response.status).toBe(200);
    return response.body.results;
}

export async function createChartAndUpdateDashboard(
    client: ApiClient,
    projectUuid: string,
    body: CreateChartInDashboard,
    dashboard?: UpdateDashboard,
): Promise<{ chart: SavedChart; dashboard: Dashboard }> {
    const response = await client.post<{ results: SavedChart }>(
        `${apiUrl}/projects/${projectUuid}/saved`,
        body,
    );
    expect(response.status).toBe(200);
    const newChart = response.body.results;
    expect(newChart.name).toBe(body.name);
    expect(newChart.dashboardUuid).toBe(body.dashboardUuid);

    const updatedDashboard = await updateDashboard(client, body.dashboardUuid, {
        ...dashboard,
        tabs: [],
        tiles: [
            ...(dashboard && isDashboardVersionedFields(dashboard)
                ? dashboard.tiles
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
    });

    return { chart: newChart, dashboard: updatedDashboard };
}

async function deleteDashboardsByName(
    client: ApiClient,
    names: string[],
): Promise<void> {
    const resp = await client.get<{
        results: Array<{ uuid: string; name: string }>;
    }>(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`);
    expect(resp.status).toBe(200);
    for (const { uuid, name } of resp.body.results) {
        if (names.includes(name)) {
            const deleteResp = await client.delete(
                `${apiUrl}/dashboards/${uuid}`,
            );
            expect(deleteResp.status).toBe(200);
        }
    }
}

async function deleteChartsByName(
    client: ApiClient,
    names: string[],
): Promise<void> {
    const resp = await client.get<ApiChartSummaryListResponse>(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
    );
    expect(resp.status).toBe(200);
    for (const { uuid, name } of resp.body.results) {
        if (names.includes(name)) {
            const deleteResp = await client.delete(`${apiUrl}/saved/${uuid}`);
            expect(deleteResp.status).toBe(200);
        }
    }
}

async function createSpace(
    client: ApiClient,
    projectUuid: string,
    spaceName: string,
): Promise<string> {
    const resp = await client.post<{ results: { uuid: string } }>(
        `${apiUrl}/projects/${projectUuid}/spaces`,
        {
            name: spaceName,
            isPrivate: false,
        },
    );
    expect(resp.status).toBe(200);
    return resp.body.results.uuid;
}

describe('Lightdash dashboard', () => {
    const dashboardName = 'Dashboard with charts that belong to dashboard';
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
        // clean previous e2e dashboards and charts
        await deleteDashboardsByName(admin, [dashboardMock.name]);
        await deleteChartsByName(admin, [chartMock.name]);
    });

    it('Should create charts that belong to dashboard', async () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        // create dashboard
        const newDashboard = await createDashboard(admin, projectUuid, {
            ...dashboardMock,
            name: dashboardName,
        });

        // update dashboard with chart
        const { chart: newChart, dashboard: updatedDashboard } =
            await createChartAndUpdateDashboard(admin, projectUuid, {
                ...chartMock,
                dashboardUuid: newDashboard.uuid,
                spaceUuid: null,
            });

        expect(updatedDashboard.tiles.length).toBe(1);
        const tile = updatedDashboard.tiles[0] as DashboardChartTile;
        expect(tile.properties.savedChartUuid).toBe(newChart.uuid);
        expect(tile.properties.belongsToDashboard).toBe(true);

        // update dashboard with second chart
        const { chart: newChart2, dashboard: updatedDashboard2 } =
            await createChartAndUpdateDashboard(
                admin,
                projectUuid,
                {
                    ...chartMock,
                    dashboardUuid: newDashboard.uuid,
                    spaceUuid: null,
                },
                {
                    tiles: updatedDashboard.tiles,
                    tabs: [],
                },
            );

        expect(updatedDashboard2.tiles.length).toBe(2);
        const firstTile = updatedDashboard2.tiles.find(
            (t: DashboardTile) =>
                t.type === DashboardTileTypes.SAVED_CHART &&
                t.properties.savedChartUuid === newChart.uuid &&
                t.properties.belongsToDashboard,
        );
        const secondTile = updatedDashboard2.tiles.find(
            (t: DashboardTile) =>
                t.type === DashboardTileTypes.SAVED_CHART &&
                t.properties.savedChartUuid === newChart2.uuid &&
                t.properties.belongsToDashboard,
        );
        expect(firstTile).toBeDefined();
        expect(secondTile).toBeDefined();
    });

    it('Should update chart that belongs to dashboard', async () => {
        const newDescription = 'updated chart description';
        const response = await admin.get<{
            results: Dashboard[];
        }>(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        // Get the latest dashboard created via API
        const dashboard = response.body.results
            .sort(
                (a: Dashboard, b: Dashboard) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime(),
            )
            .find((s: Dashboard) => s.name === dashboardName);

        const dashboardResponse = await admin.get<{ results: Dashboard }>(
            `${apiUrl}/dashboards/${dashboard!.uuid}`,
        );

        const tileWithChartInDashboard =
            dashboardResponse.body.results.tiles.find(
                (tile: DashboardTile) =>
                    tile.type === DashboardTileTypes.SAVED_CHART &&
                    tile.properties.belongsToDashboard,
            );

        expect(tileWithChartInDashboard).toBeDefined();

        const chartInDashboard = (
            tileWithChartInDashboard as DashboardChartTile
        ).properties.savedChartUuid;

        const chartResponse = await admin.patch<{ results: SavedChart }>(
            `${apiUrl}/saved/${chartInDashboard}`,
            {
                description: newDescription,
            },
        );
        expect(chartResponse.status).toBe(200);
        expect(chartResponse.body.results.name).toBe(chartMock.name);
        expect(chartResponse.body.results.description).toBe(newDescription);
        expect(chartResponse.body.results.dashboardUuid).toBe(dashboard!.uuid);
        expect(chartResponse.body.results.dashboardName).toBe(dashboardName);
    });

    it('Should get chart summaries without charts that belongs to dashboard', async () => {
        const response = await admin.get<{
            results: Dashboard[];
        }>(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        // Get the latest dashboard created via API
        const dashboard = response.body.results
            .sort(
                (a: Dashboard, b: Dashboard) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime(),
            )
            .find((s: Dashboard) => s.name === dashboardName);

        const dashboardResponse = await admin.get<{ results: Dashboard }>(
            `${apiUrl}/dashboards/${dashboard!.uuid}`,
        );

        const tileWithChartInDashboard =
            dashboardResponse.body.results.tiles.find(
                (tile: DashboardTile) =>
                    tile.type === DashboardTileTypes.SAVED_CHART &&
                    tile.properties.belongsToDashboard,
            );
        expect(tileWithChartInDashboard).toBeDefined();

        const chartInDashboard = (
            tileWithChartInDashboard as DashboardChartTile
        ).properties.savedChartUuid;

        const chartResponse = await admin.get<ApiChartSummaryListResponse>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
        );
        expect(chartResponse.status).toBe(200);
        const projectChartsUuids = chartResponse.body.results.map(
            ({ uuid }) => uuid,
        );
        expect(projectChartsUuids.length).not.toBe(0);
        expect(projectChartsUuids).not.toContain(chartInDashboard);
    });

    it('Should create dashboard with parameters and retrieve them correctly', async () => {
        const testParameters = {
            time_zoom: {
                parameterName: 'time_zoom',
                value: 'weekly',
            },
            region: {
                parameterName: 'region',
                value: ['US', 'EU'],
            },
        };

        const dashboardWithParameters: CreateDashboard = {
            ...dashboardMock,
            name: `${dashboardName} with Parameters`,
            parameters: testParameters,
        };

        const createdDashboard = await createDashboard(
            admin,
            SEED_PROJECT.project_uuid,
            dashboardWithParameters,
        );
        expect(createdDashboard.name).toBe(dashboardWithParameters.name);

        // Get the dashboard via API to verify parameters are stored and retrieved correctly
        const response = await admin.get<{ results: Dashboard }>(
            `${apiUrl}/dashboards/${createdDashboard.uuid}`,
        );
        expect(response.status).toBe(200);
        const retrievedDashboard = response.body.results;

        // Verify parameters are present and correct
        expect(retrievedDashboard.parameters).toBeDefined();

        // Check first parameter
        const firstParam = retrievedDashboard?.parameters?.time_zoom;
        expect(firstParam).toBeDefined();
        expect(firstParam?.parameterName).toBe('time_zoom');
        expect(firstParam?.value).toBe('weekly');

        // Check second parameter
        const secondParam = retrievedDashboard?.parameters?.region;
        expect(secondParam).toBeDefined();
        expect(secondParam?.parameterName).toBe('region');
        expect(secondParam?.value).toEqual(['US', 'EU']);

        // Now update the dashboard with different parameters
        const updatedParameters = {
            time_period: {
                parameterName: 'time_period',
                value: 'monthly',
            },
            category: {
                parameterName: 'category',
                value: 'premium',
            },
            markets: {
                parameterName: 'markets',
                value: ['APAC', 'Americas'],
            },
        };

        const updatePayload: UpdateDashboard = {
            ...retrievedDashboard,
            parameters: updatedParameters,
        };

        await updateDashboard(admin, createdDashboard.uuid, updatePayload);

        // Fetch the updated dashboard to verify changes persisted
        const finalResponse = await admin.get<{ results: Dashboard }>(
            `${apiUrl}/dashboards/${createdDashboard.uuid}`,
        );
        expect(finalResponse.status).toBe(200);
        const finalDashboard = finalResponse.body.results;

        // Verify updated parameters
        expect(finalDashboard.parameters).toBeDefined();
        expect(Object.keys(finalDashboard.parameters ?? {})).toHaveLength(3);

        // Check first updated parameter
        const updatedFirstParam = finalDashboard?.parameters?.time_period;
        expect(updatedFirstParam).toBeDefined();
        expect(updatedFirstParam?.parameterName).toBe('time_period');
        expect(updatedFirstParam?.value).toBe('monthly');

        // Check second updated parameter
        const updatedSecondParam = finalDashboard?.parameters?.category;
        expect(updatedSecondParam).toBeDefined();
        expect(updatedSecondParam?.parameterName).toBe('category');
        expect(updatedSecondParam?.value).toBe('premium');

        // Check third updated parameter (array value)
        const updatedThirdParam = finalDashboard?.parameters?.markets;
        expect(updatedThirdParam).toBeDefined();
        expect(updatedThirdParam?.parameterName).toBe('markets');
        expect(updatedThirdParam?.value).toEqual(['APAC', 'Americas']);
    });

    describe('Dashboard slug support', () => {
        it('Should get dashboard by slug', async () => {
            const slug = 'jaffle-dashboard';

            const response = await admin.get<{
                status: string;
                results: Dashboard;
            }>(`${apiUrl}/dashboards/${slug}`);
            expect(response.status).toBe(200);
            expect(response.body.status).toBe('ok');
            expect(response.body.results.name).toBe('Jaffle dashboard');
            expect(response.body.results.slug).toBe(slug);
        });

        it('Should create and access dashboard by slug', async () => {
            const projectUuid = SEED_PROJECT.project_uuid;
            const testDashboardName = `Test Dashboard ${Date.now()}`;

            const newDashboard = await createDashboard(admin, projectUuid, {
                ...dashboardMock,
                name: testDashboardName,
            });
            expect(newDashboard.slug).toBeDefined();

            // Access the dashboard by slug
            const response = await admin.get<{ results: Dashboard }>(
                `${apiUrl}/dashboards/${newDashboard.slug}`,
            );
            expect(response.status).toBe(200);
            expect(response.body.results.uuid).toBe(newDashboard.uuid);
            expect(response.body.results.name).toBe(testDashboardName);

            // Clean up
            await deleteDashboardsByName(admin, [testDashboardName]);
        });

        it('Should update dashboard accessed by slug', async () => {
            const projectUuid = SEED_PROJECT.project_uuid;
            const testDashboardName = `Test Dashboard ${Date.now()}`;
            const updatedDescription = 'Updated via slug test';

            const newDashboard = await createDashboard(admin, projectUuid, {
                ...dashboardMock,
                name: testDashboardName,
            });

            // Update dashboard using slug
            const updateResponse = await admin.patch<{
                results: Dashboard;
            }>(`${apiUrl}/dashboards/${newDashboard.slug}`, {
                name: testDashboardName,
                description: updatedDescription,
            });
            expect(updateResponse.status).toBe(200);
            expect(updateResponse.body.results.description).toBe(
                updatedDescription,
            );

            // Verify via UUID
            const verifyResponse = await admin.get<{ results: Dashboard }>(
                `${apiUrl}/dashboards/${newDashboard.uuid}`,
            );
            expect(verifyResponse.body.results.description).toBe(
                updatedDescription,
            );

            // Clean up
            await deleteDashboardsByName(admin, [testDashboardName]);
        });
    });

    describe('Dashboard space selection', () => {
        const spaceSelectionDashboardName = 'Dashboard space selection test';

        afterAll(async () => {
            const cleanupClient = await login();
            await deleteDashboardsByName(cleanupClient, [
                spaceSelectionDashboardName,
            ]);
        });

        it('Should create a dashboard in the specified space', async () => {
            const projectUuid = SEED_PROJECT.project_uuid;
            const spaceName = `test-space-${Date.now()}`;

            const spaceUuid = await createSpace(admin, projectUuid, spaceName);
            const dashboard = await createDashboard(admin, projectUuid, {
                ...dashboardMock,
                name: spaceSelectionDashboardName,
                spaceUuid,
            });
            expect(dashboard.spaceUuid).toBe(spaceUuid);
        });

        it('Should create a dashboard in the first accessible space when no spaceUuid is provided', async () => {
            const projectUuid = SEED_PROJECT.project_uuid;

            const dashboard = await createDashboard(admin, projectUuid, {
                ...dashboardMock,
                name: spaceSelectionDashboardName,
            });
            expect(dashboard.spaceUuid).toBeDefined();
            expect(typeof dashboard.spaceUuid).toBe('string');

            // Verify the space exists in the project
            const spacesResponse = await admin.get<{
                results: Array<{ uuid: string }>;
            }>(`${apiUrl}/projects/${projectUuid}/spaces`);
            const spaceUuids = spacesResponse.body.results.map((s) => s.uuid);
            expect(spaceUuids).toContain(dashboard.spaceUuid);
        });
    });
});
