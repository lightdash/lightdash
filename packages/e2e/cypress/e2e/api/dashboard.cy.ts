import {
    ApiChartSummaryListResponse,
    CreateDashboard,
    CreateSavedChart,
    Dashboard,
    DashboardChartTile,
    DashboardTileTypes,
    SavedChart,
    SEED_PROJECT,
    UpdateDashboard,
} from '@lightdash/common';
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
    tiles: [
        {
            type: DashboardTileTypes.SAVED_CHART,
            x: 0,
            y: 0,
            h: 5,
            w: 5,
            properties: {
                savedChartUuid: null,
                newChartData: chartMock,
            },
        },
    ],
};

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
    it('Should create dashboard and chart at the same time', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        // create dashboard and chart
        cy.request<{ results: Dashboard }>({
            method: 'POST',
            url: `${apiUrl}/projects/${projectUuid}/dashboards`,
            body: dashboardMock,
        }).then((createDashboardResponse) => {
            const tile = createDashboardResponse.body.results.tiles[0];

            expect(tile.properties).to.have.property('savedChartUuid');
            expect(
                (tile as DashboardChartTile).properties.belongsToDashboard,
            ).to.eq(true);
            // confirm chart was created
            cy.request<{ results: SavedChart }>(
                `${apiUrl}/saved/${
                    (tile as DashboardChartTile).properties.savedChartUuid
                }`,
            ).then((chartResponse) => {
                expect(chartResponse.status).to.eq(200);
                expect(chartResponse.body.results.name).to.eq(chartMock.name);
                expect(chartResponse.body.results.dashboardUuid).to.eq(
                    createDashboardResponse.body.results.uuid,
                );
                expect(chartResponse.body.results.spaceUuid).to.eq(
                    createDashboardResponse.body.results.spaceUuid,
                );
                chartUuid = chartResponse.body.results.uuid;
                dashboardUuid = createDashboardResponse.body.results.uuid;
            });

            const updateDashboardMock: UpdateDashboard = {
                tiles: [
                    ...createDashboardResponse.body.results.tiles,
                    {
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 5,
                        y: 0,
                        h: 5,
                        w: 5,
                        properties: {
                            savedChartUuid: null,
                            newChartData: chartMock,
                        },
                    },
                ],
            };
            // update dashboard and create new chart
            cy.request<{ results: Dashboard }>({
                method: 'PATCH',
                url: `${apiUrl}/dashboards/${createDashboardResponse.body.results.uuid}`,
                body: updateDashboardMock,
            }).then((updateDashboardResponse) => {
                const firstTile = updateDashboardResponse.body.results.tiles[0];
                const secondTile =
                    updateDashboardResponse.body.results.tiles[1];

                expect(secondTile.properties).to.have.property(
                    'savedChartUuid',
                );
                // confirm first chart didn't change
                expect(
                    (firstTile as DashboardChartTile).properties.savedChartUuid,
                ).to.eq((tile as DashboardChartTile).properties.savedChartUuid);
                // confirm second chart is different from first chart
                expect(
                    (secondTile as DashboardChartTile).properties
                        .savedChartUuid,
                ).to.not.eq(
                    (tile as DashboardChartTile).properties.savedChartUuid,
                );

                // confirm chart was created during dashboard update
                cy.request<{ results: SavedChart }>(
                    `${apiUrl}/saved/${
                        (secondTile as DashboardChartTile).properties
                            .savedChartUuid
                    }`,
                ).then((chartResponse) => {
                    expect(chartResponse.status).to.eq(200);
                    expect(chartResponse.body.results.name).to.eq(
                        chartMock.name,
                    );
                    expect(chartResponse.body.results.dashboardUuid).to.eq(
                        createDashboardResponse.body.results.uuid,
                    );
                    expect(chartResponse.body.results.spaceUuid).to.eq(
                        createDashboardResponse.body.results.spaceUuid,
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
