import {
    Dashboard,
    DashboardChartTile,
    DashboardTileTypes,
    SEED_PROJECT,
    SavedChart,
} from '@lightdash/common';
import { expect, test } from '@playwright/test';
import { login } from '../support/auth';
import {
    createChartAndUpdateDashboard,
    createChartInSpace,
    createDashboard,
    createProject,
    createSpace,
    deleteProjectsByName,
} from '../support/commands';
import { chartMock } from '../support/mocks';
import warehouseConnections from '../support/warehouses';

const apiUrl = '/api/v1';

const checkPromotedChart = (
    promotedChart: SavedChart,
    upstreamChart: SavedChart,
) => {
    // Slug, metricQuery and chartConfig are not returned on /charts so we can't compare
    const equalProperties: Array<keyof SavedChart> = [
        'name',
        'spaceName',
        'organizationUuid',
    ];
    equalProperties.forEach((prop) => {
        expect(promotedChart[prop], `property ${prop}`).toBe(
            upstreamChart[prop],
        );
    });

    const notEqualProperties: Array<keyof SavedChart> = [
        'uuid',
        'projectUuid',
        'spaceUuid',
    ];
    notEqualProperties.forEach((prop) => {
        expect(promotedChart[prop], `property ${prop}`).not.toBe(
            upstreamChart[prop],
        );
    });
};

const checkPromotedDashboard = (
    promotedDashboard: Dashboard,
    upstreamDashboard: Dashboard,
) => {
    // Slug are not returned on /dashboards so we can't compare
    const equalProperties: Array<keyof Dashboard> = [
        'name',
        'spaceName',
        'organizationUuid',
    ];
    equalProperties.forEach((prop) => {
        expect(promotedDashboard[prop], `property ${prop}`).toBe(
            upstreamDashboard[prop],
        );
    });
    if (promotedDashboard.tiles) {
        expect(promotedDashboard.tiles.length).toBe(
            upstreamDashboard.tiles.length,
        );

        promotedDashboard.tiles.forEach(
            (promotedTile: DashboardChartTile, index: number) => {
                const upstreamTile = upstreamDashboard.tiles[
                    index
                ] as DashboardChartTile;
                expect(promotedTile.type).toBe(upstreamTile.type);
                expect(promotedTile.properties.chartName).toBe(
                    upstreamTile.properties.chartName,
                );

                // Chart in dashboards should not have the same chart uuid
                if (promotedTile.properties.savedChartUuid !== undefined)
                    expect(promotedTile.properties.savedChartUuid).not.toBe(
                        upstreamTile.properties.savedChartUuid,
                    );
                // Charts in space should have the `savedChartUuid` property set to null
                else
                    expect(promotedTile.properties.savedChartUuid).toBe(
                        upstreamTile.properties.savedChartUuid,
                    );

                // FIXME this is currently broken
                // expect(promotedTile.uuid).not.toBe(upstreamTile.uuid)
            },
        );
    }

    const notEqualProperties: Array<keyof Dashboard> = [
        'uuid',
        'projectUuid',
        'spaceUuid',
    ];
    notEqualProperties.forEach((prop) => {
        expect(promotedDashboard[prop], `property ${prop}`).not.toBe(
            upstreamDashboard[prop],
        );
    });
};

test.describe.serial('Promotion charts and dashboards', () => {
    const upstreamProjectName = `Upstream project ${Date.now()}`;
    let upstreamProjectUuid: string;

    test.beforeEach(async ({ request }) => {
        await login(request);
    });

    test.beforeAll(async ({ request }) => {
        await login(request);
        upstreamProjectUuid = await createProject(
            request,
            upstreamProjectName,
            warehouseConnections.postgresSQL,
        );
    });

    test.afterAll(async ({ request }) => {
        await login(request);
        await deleteProjectsByName(request, [upstreamProjectName]);
    });

    test('Set upstream project on seed project', async ({ request }) => {
        const response = await request.patch(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/metadata`,
            {
                headers: { 'Content-type': 'application/json' },
                data: {
                    upstreamProjectUuid,
                },
            },
        );
        expect(response.status()).toBe(200);
    });

    test('Promote existing chart in space', async ({ request }) => {
        const chartsResponse = await request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
        );
        expect(chartsResponse.status()).toBe(200);
        const chartsBody = await chartsResponse.json();
        expect(chartsBody.results.length).toBeGreaterThan(0);

        const chart = chartsBody.results.find(
            (c: SavedChart) => c.name === 'How many orders we have over time ?',
        );
        expect(chart).toBeDefined();

        const promoteResponse = await request.post(
            `${apiUrl}/saved/${chart.uuid}/promote`,
        );
        expect(promoteResponse.status()).toBe(200);
        const promoteBody = await promoteResponse.json();
        const upstreamChart = promoteBody.results;

        checkPromotedChart(chart, upstreamChart);

        // Promote again
        const promoteAgainResponse = await request.post(
            `${apiUrl}/saved/${chart.uuid}/promote`,
        );
        expect(promoteAgainResponse.status()).toBe(200);
    });

    test('Promote new chart in new space', async ({ request }) => {
        const now = Date.now();
        const spaceUuid = await createSpace(
            request,
            SEED_PROJECT.project_uuid,
            `Public space to promote ${now}`,
        );

        const chart = await createChartInSpace(
            request,
            SEED_PROJECT.project_uuid,
            {
                ...chartMock,
                name: `Chart to promote ${now}`,
                spaceUuid,
                dashboardUuid: null,
            },
        );

        const promoteResponse = await request.post(
            `${apiUrl}/saved/${chart.uuid}/promote`,
        );
        expect(promoteResponse.status()).toBe(200);
        const promoteBody = await promoteResponse.json();
        const upstreamChart = promoteBody.results;

        checkPromotedChart(chart, upstreamChart);

        // Promote again
        const promoteAgainResponse = await request.post(
            `${apiUrl}/saved/${chart.uuid}/promote`,
        );
        expect(promoteAgainResponse.status()).toBe(200);
    });

    test('Promote existing dashboard in space', async ({ request }) => {
        const dashboardsResponse = await request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        );
        expect(dashboardsResponse.status()).toBe(200);
        const dashboardsBody = await dashboardsResponse.json();
        expect(dashboardsBody.results.length).toBeGreaterThan(0);

        const dashboard = dashboardsBody.results.find(
            (c: Dashboard) => c.name === 'Jaffle dashboard',
        );
        expect(dashboard).toBeDefined();

        const promoteResponse = await request.post(
            `${apiUrl}/dashboards/${dashboard.uuid}/promote`,
        );
        expect(promoteResponse.status()).toBe(200);
        const promoteBody = await promoteResponse.json();
        const upstreamDashboard = promoteBody.results;

        checkPromotedDashboard(
            {
                spaceName: 'Jaffle shop', // not returned in the list of dashboards
                ...dashboard,
            },
            upstreamDashboard,
        );

        // Promote again
        const promoteAgainResponse = await request.post(
            `${apiUrl}/dashboards/${dashboard.uuid}/promote`,
        );
        expect(promoteAgainResponse.status()).toBe(200);
    });

    test('Promote new dashboard', async ({ request }) => {
        // Steps:
        // 1. Create a new space
        // 2. Create a new chart in the space
        // 3. Create a new dashboard with the chart
        // 4. Create chart within dashboard
        // 5. Promote the dashboard
        const now = Date.now();
        const projectUuid = SEED_PROJECT.project_uuid;

        const spaceUuid = await createSpace(
            request,
            projectUuid,
            `Public space to promote ${now}`,
        );

        const chart = await createChartInSpace(request, projectUuid, {
            ...chartMock,
            name: `Chart to promote ${now}`,
            spaceUuid,
            dashboardUuid: null,
        });

        const newDashboard = await createDashboard(request, projectUuid, {
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
                request,
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

        const promoteResponse = await request.post(
            `${apiUrl}/dashboards/${updatedDashboard.uuid}/promote`,
        );
        expect(promoteResponse.status()).toBe(200);
        const promoteBody = await promoteResponse.json();
        const upstreamDashboard = promoteBody.results;

        checkPromotedDashboard(updatedDashboard, upstreamDashboard);

        // Promote again
        const promoteAgainResponse = await request.post(
            `${apiUrl}/dashboards/${updatedDashboard.uuid}/promote`,
        );
        expect(promoteAgainResponse.status()).toBe(200);
    });
});
