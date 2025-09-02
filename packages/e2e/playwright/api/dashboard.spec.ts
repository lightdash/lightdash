import { test, expect, APIRequestContext } from '@playwright/test';
import {
    CreateChartInDashboard,
    CreateDashboard,
    Dashboard,
    DashboardChartTile,
    DashboardTileTypes,
    isDashboardVersionedFields,
    SavedChart,
    SEED_PROJECT,
    UpdateDashboard,
} from '@lightdash/common';
import { login } from '../support/auth';
import { chartMock, dashboardMock } from '../support/mocks';

const apiUrl = '/api/v1';

interface DashboardWithName {
    name: string;
    uuid: string;
    updatedAt: string;
}

interface ChartWithName {
    name: string;
    uuid: string;
}

const cleanupTestData = async (request: APIRequestContext) => {
    try {
        const dashboardsResponse = await request.get(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        if (dashboardsResponse.ok()) {
            const dashboardsBody = await dashboardsResponse.json();
            await Promise.all(
                dashboardsBody.results
                    .filter((dashboard: DashboardWithName) => 
                        dashboard.name === dashboardMock.name || dashboard.name.includes('Dashboard with charts')
                    )
                    .map((dashboard: DashboardWithName) => 
                        request.delete(`${apiUrl}/dashboards/${dashboard.uuid}`)
                    )
            );
        }

        const chartsResponse = await request.get(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`);
        if (chartsResponse.ok()) {
            const chartsBody = await chartsResponse.json();
            await Promise.all(
                chartsBody.results
                    .filter((chart: ChartWithName) => chart.name === chartMock.name)
                    .map((chart: ChartWithName) => 
                        request.delete(`${apiUrl}/saved/${chart.uuid}`)
                    )
            );
        }
    } catch (error) {
        // Ignore cleanup errors
    }
};

const createDashboard = async (
    request: APIRequestContext,
    projectUuid: string,
    body: CreateDashboard,
): Promise<Dashboard> => {
    const response = await request.post(`${apiUrl}/projects/${projectUuid}/dashboards`, {
        data: body,
    });
    expect(response.status()).toBe(201);
    
    const responseBody = await response.json();
    return responseBody.results;
};

const updateDashboard = async (
    request: APIRequestContext,
    dashboardUuid: string,
    body: UpdateDashboard,
): Promise<Dashboard> => {
    const response = await request.patch(`${apiUrl}/dashboards/${dashboardUuid}`, {
        data: body,
    });
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    return responseBody.results;
};

const createChartAndUpdateDashboard = async (
    request: APIRequestContext,
    projectUuid: string,
    body: CreateChartInDashboard,
    dashboard?: UpdateDashboard,
): Promise<{ chart: SavedChart; dashboard: Dashboard }> => {
    const response = await request.post(`${apiUrl}/projects/${projectUuid}/saved`, {
        data: body,
    });
    expect(response.status()).toBe(200);
    
    const responseBody = await response.json();
    const newChart = responseBody.results;
    expect(newChart.name).toBe(body.name);
    expect(newChart.dashboardUuid).toBe(body.dashboardUuid);
    
    const updatedDashboard = await updateDashboard(request, body.dashboardUuid, {
        ...dashboard,
        tabs: [],
        tiles: [
            ...(dashboard && isDashboardVersionedFields(dashboard) ? dashboard.tiles : []),
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
    
    return {
        chart: newChart,
        dashboard: updatedDashboard,
    };
};

test.describe.serial('Lightdash dashboard', () => {
    const dashboardName = 'Dashboard with charts that belong to dashboard';
    
    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test.beforeAll(async ({ request }) => {
        await login(request);
        await cleanupTestData(request);
    });

    test.afterAll(async ({ request }) => {
        await login(request);
        await cleanupTestData(request);
    });

    test('Should create charts that belong to dashboard', async ({ request }) => {
        const projectUuid = SEED_PROJECT.project_uuid;

        const newDashboard = await createDashboard(request, projectUuid, {
            ...dashboardMock,
            name: dashboardName,
        });

        const { chart: newChart, dashboard: updatedDashboard } = 
            await createChartAndUpdateDashboard(request, projectUuid, {
                ...chartMock,
                dashboardUuid: newDashboard.uuid,
                spaceUuid: null,
            });

        expect(updatedDashboard.tiles.length).toBe(1);
        const tile = updatedDashboard.tiles[0] as DashboardChartTile;
        expect(tile.properties.savedChartUuid).toBe(newChart.uuid);
        expect(tile.properties.belongsToDashboard).toBe(true);

        const { chart: newChart2, dashboard: updatedDashboard2 } = 
            await createChartAndUpdateDashboard(
                request,
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
            ({ properties }: DashboardChartTile) =>
                properties.savedChartUuid === newChart.uuid &&
                properties.belongsToDashboard,
        );
        const secondTile = updatedDashboard2.tiles.find(
            ({ properties }: DashboardChartTile) =>
                properties.savedChartUuid === newChart2.uuid &&
                properties.belongsToDashboard,
        );
        
        expect(firstTile).toBeDefined();
        expect(secondTile).toBeDefined();
    });

    test('Should update chart that belongs to dashboard', async ({ request }) => {
        const newDescription = 'updated chart description';
        
        const response = await request.get(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        const responseBody = await response.json();
        
        const dashboard = responseBody.results
            .sort((d: DashboardWithName) => d.updatedAt)
            .reverse()
            .find((s: DashboardWithName) => s.name === dashboardName);

        const dashboardResponse = await request.get(`${apiUrl}/dashboards/${dashboard.uuid}`);
        const dashboardBody = await dashboardResponse.json();
        
        const tileWithChartInDashboard = dashboardBody.results.tiles.find(
            (tile: DashboardChartTile) => tile.properties.belongsToDashboard,
        );

        expect(tileWithChartInDashboard).toBeDefined();

        const chartInDashboard = tileWithChartInDashboard.properties.savedChartUuid;

        const chartResponse = await request.patch(`${apiUrl}/saved/${chartInDashboard}`, {
            data: {
                description: newDescription,
            },
        });
        expect(chartResponse.status()).toBe(200);
        
        const chartBody = await chartResponse.json();
        expect(chartBody.results.name).toBe(chartMock.name);
        expect(chartBody.results.description).toBe(newDescription);
        expect(chartBody.results.dashboardUuid).toBe(dashboard.uuid);
        expect(chartBody.results.dashboardName).toBe(dashboardName);
    });

    test('Should get chart summaries without charts that belongs to dashboard', async ({ request }) => {
        const response = await request.get(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        const responseBody = await response.json();
        
        const dashboard = responseBody.results
            .sort((d: DashboardWithName) => d.updatedAt)
            .reverse()
            .find((s: DashboardWithName) => s.name === dashboardName);

        const dashboardResponse = await request.get(`${apiUrl}/dashboards/${dashboard.uuid}`);
        const dashboardBody = await dashboardResponse.json();
        
        const tileWithChartInDashboard = dashboardBody.results.tiles.find(
            (tile: DashboardChartTile) => tile.properties.belongsToDashboard,
        );
        
        expect(tileWithChartInDashboard).toBeDefined();

        const chartInDashboard = tileWithChartInDashboard.properties.savedChartUuid;

        const chartResponse = await request.get(`${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`);
        expect(chartResponse.status()).toBe(200);
        
        const chartBody = await chartResponse.json();
        const projectChartsUuids = chartBody.results.map(({ uuid }: ChartWithName) => uuid);
        expect(projectChartsUuids.length).not.toBe(0);
        expect(projectChartsUuids).not.toContain(chartInDashboard);
    });

    test('Should create dashboard with parameters and retrieve them correctly', async ({ request }) => {
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
            request,
            SEED_PROJECT.project_uuid,
            dashboardWithParameters,
        );
        expect(createdDashboard.name).toBe(dashboardWithParameters.name);

        const response = await request.get(`${apiUrl}/dashboards/${createdDashboard.uuid}`);
        expect(response.status()).toBe(200);
        
        const body = await response.json();
        const retrievedDashboard = body.results;

        expect(retrievedDashboard.parameters).toBeDefined();
        expect(Object.keys(retrievedDashboard.parameters)).toHaveLength(2);

        const firstParam = retrievedDashboard.parameters.time_zoom;
        expect(firstParam).toBeDefined();
        expect(firstParam.parameterName).toBe('time_zoom');
        expect(firstParam.value).toBe('weekly');

        const secondParam = retrievedDashboard.parameters.region;
        expect(secondParam).toBeDefined();
        expect(secondParam.parameterName).toBe('region');
        expect(secondParam.value).toEqual(['US', 'EU']);

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

        await updateDashboard(request, createdDashboard.uuid, updatePayload);

        const finalResponse = await request.get(`${apiUrl}/dashboards/${createdDashboard.uuid}`);
        expect(finalResponse.status()).toBe(200);
        
        const finalBody = await finalResponse.json();
        const finalDashboard = finalBody.results;

        expect(finalDashboard.parameters).toBeDefined();
        expect(Object.keys(finalDashboard.parameters)).toHaveLength(3);

        const updatedFirstParam = finalDashboard.parameters.time_period;
        expect(updatedFirstParam).toBeDefined();
        expect(updatedFirstParam.parameterName).toBe('time_period');
        expect(updatedFirstParam.value).toBe('monthly');

        const updatedSecondParam = finalDashboard.parameters.category;
        expect(updatedSecondParam).toBeDefined();
        expect(updatedSecondParam.parameterName).toBe('category');
        expect(updatedSecondParam.value).toBe('premium');

        const updatedThirdParam = finalDashboard.parameters.markets;
        expect(updatedThirdParam).toBeDefined();
        expect(updatedThirdParam.parameterName).toBe('markets');
        expect(updatedThirdParam.value).toEqual(['APAC', 'Americas']);
    });
});