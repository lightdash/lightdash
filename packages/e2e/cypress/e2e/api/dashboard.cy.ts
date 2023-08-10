import {
    ApiChartSummaryListResponse,
    CreateChartInDashboard,
    CreateDashboard,
    CreateSavedChart,
    Dashboard,
    DashboardChartTile,
    DashboardTileTypes,
    SavedChart,
    SEED_PROJECT,
    UpdateDashboard,
} from '@lightdash/common';
import { isDashboardVersionedFields } from '@lightdash/common/src/types/dashboard';
import { ChartType } from '@lightdash/common/src/types/savedCharts';

const apiUrl = '/api/v1';

const chartMock: CreateSavedChart = {
    name: 'chart in dashboard',
    tableName: 'orders',
    metricQuery: {
        dimensions: ['orders_customer_id'],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 1,
        tableCalculations: [],
    },
    chartConfig: {
        type: ChartType.TABLE,
    },
    tableConfig: {
        columnOrder: [],
    },
};

const dashboardMock: CreateDashboard = {
    name: 'Create dashboard via API',
    tiles: [],
};

const createDashboard = (
    projectUuid: string,
    body: CreateDashboard,
): Cypress.Chainable<Dashboard> =>
    cy
        .request<{
            results: Dashboard;
        }>({
            method: 'POST',
            url: `${apiUrl}/projects/${projectUuid}/dashboards`,
            body,
        })
        .then((response) => {
            expect(response.status).to.eq(201);
            return response.body.results;
        });

const updateDashboard = (
    dashboardUuid: string,
    body: UpdateDashboard,
): Cypress.Chainable<Dashboard> =>
    cy
        .request<{ results: Dashboard }>({
            method: 'PATCH',
            url: `${apiUrl}/dashboards/${dashboardUuid}`,
            body,
        })
        .then((response) => {
            expect(response.status).to.eq(200);
            return response.body.results;
        });

const createChartAndUpdateDashboard = (
    projectUuid: string,
    body: CreateChartInDashboard,
    dashboard?: UpdateDashboard,
): Cypress.Chainable<{ chart: SavedChart; dashboard: Dashboard }> =>
    cy
        .request<{
            results: SavedChart;
        }>({
            method: 'POST',
            url: `${apiUrl}/projects/${projectUuid}/saved`,
            body,
        })
        .then((response) => {
            expect(response.status).to.eq(200);
            const newChart = response.body.results;
            expect(newChart.name).to.eq(chartMock.name);
            expect(newChart.dashboardUuid).to.eq(body.dashboardUuid);
            return updateDashboard(body.dashboardUuid, {
                ...dashboard,
                tiles: [
                    ...(dashboard && isDashboardVersionedFields(dashboard)
                        ? dashboard.tiles
                        : []),
                    {
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
            }).then((updatedDashboard) => ({
                chart: newChart,
                dashboard: updatedDashboard,
            }));
        });

describe('Lightdash dashboard', () => {
    before(() => {
        cy.login();
        // clean previous e2e dashboards and charts
        cy.deleteDashboardsByName([dashboardMock.name]);
        cy.deleteChartsByName([chartMock.name]);
    });
    beforeEach(() => {
        cy.login();
    });
    let dashboardUuid: string;
    let chartUuid: string;
    it('Should create charts that belong to dashboard', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        // create dashboard
        createDashboard(projectUuid, dashboardMock).then((newDashboard) => {
            dashboardUuid = newDashboard.uuid;

            // update dashboard with chart
            createChartAndUpdateDashboard(projectUuid, {
                ...chartMock,
                dashboardUuid: newDashboard.uuid,
                spaceUuid: null,
            }).then(({ chart: newChart, dashboard: updatedDashboard }) => {
                chartUuid = newChart.uuid;
                expect(updatedDashboard.tiles.length).to.eq(1);
                const tile = updatedDashboard.tiles[0] as DashboardChartTile;
                // assert tile is correct
                expect(tile.properties.savedChartUuid).to.eq(newChart.uuid);
                expect(tile.properties.belongsToDashboard).to.eq(true);

                // update dashboard with second chart
                createChartAndUpdateDashboard(
                    projectUuid,
                    {
                        ...chartMock,
                        dashboardUuid: newDashboard.uuid,
                        spaceUuid: null,
                    },
                    {
                        tiles: updatedDashboard.tiles,
                    },
                ).then(({ chart: newChart2, dashboard: updatedDashboard2 }) => {
                    expect(updatedDashboard2.tiles.length).to.eq(2);
                    const firstTile = updatedDashboard2
                        .tiles[0] as DashboardChartTile;
                    const secondTile = updatedDashboard2
                        .tiles[1] as DashboardChartTile;

                    // assert first chart didn't change
                    expect(firstTile.properties.savedChartUuid).to.eq(
                        chartUuid,
                    );
                    // assert second tile is correct
                    expect(secondTile.properties.savedChartUuid).to.eq(
                        newChart2.uuid,
                    );
                    expect(secondTile.properties.belongsToDashboard).to.eq(
                        true,
                    );
                });
            });
        });
    });
    it('Should update chart that belongs to dashboard', () => {
        const newDescription = 'updated chart description';
        cy.request<{ results: SavedChart }>({
            method: 'PATCH',
            url: `${apiUrl}/saved/${chartUuid}`,
            body: {
                description: newDescription,
            },
        }).then((chartResponse) => {
            expect(chartResponse.status).to.eq(200);
            expect(chartResponse.body.results.name).to.eq(chartMock.name);
            expect(chartResponse.body.results.description).to.eq(
                newDescription,
            );
            expect(chartResponse.body.results.dashboardUuid).to.eq(
                dashboardUuid,
            );
            expect(chartResponse.body.results.dashboardName).to.eq(
                dashboardMock.name,
            );
        });
    });
    it('Should get chart summaries without charts that belongs to dashboard', () => {
        cy.request<ApiChartSummaryListResponse>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
        ).then((chartResponse) => {
            expect(chartResponse.status).to.eq(200);
            const projectChartsUuids = chartResponse.body.results.map(
                ({ uuid }) => uuid,
            );
            expect(projectChartsUuids.length).to.not.eq(0);
            expect(projectChartsUuids).to.not.include(chartUuid);
        });
    });
});
