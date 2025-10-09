/* eslint-disable @typescript-eslint/no-unused-expressions */
import {
    ApiChartSummaryListResponse,
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
import { chartMock, dashboardMock } from '../../support/mocks';

const apiUrl = '/api/v1';

export const createDashboard = (
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

export const createChartAndUpdateDashboard = (
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
            expect(newChart.name).to.eq(body.name);
            expect(newChart.dashboardUuid).to.eq(body.dashboardUuid);
            return updateDashboard(body.dashboardUuid, {
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
            }).then((updatedDashboard) => ({
                chart: newChart,
                dashboard: updatedDashboard,
            }));
        });

describe('Lightdash dashboard', () => {
    const dashboardName = 'Dashboard with charts that belong to dashboard';
    before(() => {
        cy.login();
        // clean previous e2e dashboards and charts
        cy.deleteDashboardsByName([dashboardMock.name]);
        cy.deleteChartsByName([chartMock.name]);
    });
    beforeEach(() => {
        cy.login();
    });
    it('Should create charts that belong to dashboard', () => {
        const projectUuid = SEED_PROJECT.project_uuid;

        // create dashboard
        createDashboard(projectUuid, {
            ...dashboardMock,
            name: dashboardName,
        }).then((newDashboard) => {
            // update dashboard with chart
            createChartAndUpdateDashboard(projectUuid, {
                ...chartMock,
                dashboardUuid: newDashboard.uuid,
                spaceUuid: null,
            }).then(({ chart: newChart, dashboard: updatedDashboard }) => {
                expect(updatedDashboard.tiles.length).to.eq(1);
                const tile = updatedDashboard.tiles[0] as DashboardChartTile;
                expect(
                    tile.properties.savedChartUuid,
                    'Check if tile is correct',
                ).to.eq(newChart.uuid);
                expect(
                    tile.properties.belongsToDashboard,
                    'Check if chart belongs to a dashboard',
                ).to.eq(true);

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
                        tabs: [],
                    },
                ).then(({ chart: newChart2, dashboard: updatedDashboard2 }) => {
                    expect(updatedDashboard2.tiles.length).to.eq(2);
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
                    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                    expect(firstTile, "Check if first tile didn't change").to
                        .not.be.undefined;
                    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                    expect(secondTile, 'Check if second tile is correct').to.not
                        .be.undefined;
                });
            });
        });
    });
    it('Should update chart that belongs to dashboard', () => {
        const newDescription = 'updated chart description';
        cy.request(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        ).then((response) => {
            // Get the latest dashboard created via API
            const dashboard = response.body.results
                .sort((d) => d.updatedAt)
                .reverse()
                .find((s) => s.name === dashboardName);

            cy.request(`${apiUrl}/dashboards/${dashboard.uuid}`).then(
                (dashboardResponse) => {
                    const tileWithChartInDashboard =
                        dashboardResponse.body.results.tiles.find(
                            (tile: DashboardChartTile) =>
                                tile.properties.belongsToDashboard,
                        );

                    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                    expect(
                        tileWithChartInDashboard,
                        'Check dashboard has chart that belongs to dashboard',
                    ).to.not.be.undefined;

                    const chartInDashboard =
                        tileWithChartInDashboard.properties.savedChartUuid;

                    cy.request<{ results: SavedChart }>({
                        method: 'PATCH',
                        url: `${apiUrl}/saved/${chartInDashboard}`,
                        body: {
                            description: newDescription,
                        },
                    }).then((chartResponse) => {
                        expect(chartResponse.status).to.eq(200);
                        expect(chartResponse.body.results.name).to.eq(
                            chartMock.name,
                        );
                        expect(chartResponse.body.results.description).to.eq(
                            newDescription,
                        );
                        expect(chartResponse.body.results.dashboardUuid).to.eq(
                            dashboard.uuid,
                        );
                        expect(chartResponse.body.results.dashboardName).to.eq(
                            dashboardName,
                        );
                    });
                },
            );
        });
    });
    it('Should get chart summaries without charts that belongs to dashboard', () => {
        cy.request(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        ).then((response) => {
            // Get the latest dashboard created via API
            const dashboard = response.body.results
                .sort((d) => d.updatedAt)
                .reverse()
                .find((s) => s.name === dashboardName);

            cy.request(`${apiUrl}/dashboards/${dashboard.uuid}`).then(
                (dashboardResponse) => {
                    const tileWithChartInDashboard =
                        dashboardResponse.body.results.tiles.find(
                            (tile: DashboardChartTile) =>
                                tile.properties.belongsToDashboard,
                        );
                    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                    expect(
                        tileWithChartInDashboard,
                        'Check dashboard has chart that belongs to dashboard',
                    ).to.not.be.undefined;

                    const chartInDashboard =
                        tileWithChartInDashboard.properties.savedChartUuid;

                    cy.request<ApiChartSummaryListResponse>(
                        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
                    ).then((chartResponse) => {
                        expect(chartResponse.status).to.eq(200);
                        const projectChartsUuids =
                            chartResponse.body.results.map(({ uuid }) => uuid);
                        expect(projectChartsUuids.length).to.not.eq(0);
                        expect(projectChartsUuids).to.not.include(
                            chartInDashboard,
                        );
                    });
                },
            );
        });
    });

    it('Should create dashboard with parameters and retrieve them correctly', () => {
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

        createDashboard(
            SEED_PROJECT.project_uuid,
            dashboardWithParameters,
        ).then((createdDashboard) => {
            expect(createdDashboard.name).to.eq(dashboardWithParameters.name);

            // Get the dashboard via API to verify parameters are stored and retrieved correctly
            cy.request<{ results: Dashboard }>({
                method: 'GET',
                url: `${apiUrl}/dashboards/${createdDashboard.uuid}`,
            }).then((response) => {
                expect(response.status).to.eq(200);
                const retrievedDashboard = response.body.results as Dashboard;

                // Verify parameters are present and correct
                expect(retrievedDashboard.parameters).to.exist;

                // Check first parameter
                const firstParam = retrievedDashboard?.parameters?.time_zoom;
                expect(firstParam).to.exist;
                expect(firstParam?.parameterName).to.eq('time_zoom');
                expect(firstParam?.value).to.eq('weekly');

                // Check second parameter
                const secondParam = retrievedDashboard?.parameters?.region;
                expect(secondParam).to.exist;
                expect(secondParam?.parameterName).to.eq('region');
                expect(secondParam?.value).to.deep.eq(['US', 'EU']);

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

                updateDashboard(createdDashboard.uuid, updatePayload).then(
                    () => {
                        // Fetch the updated dashboard to verify changes persisted
                        cy.request<{ results: Dashboard }>({
                            method: 'GET',
                            url: `${apiUrl}/dashboards/${createdDashboard.uuid}`,
                        }).then((finalResponse) => {
                            expect(finalResponse.status).to.eq(200);
                            const finalDashboard = finalResponse.body.results;

                            // Verify updated parameters
                            expect(finalDashboard.parameters).to.exist;
                            expect(
                                Object.keys(finalDashboard.parameters ?? {}),
                            ).to.have.length(3);

                            // Check first updated parameter
                            const updatedFirstParam =
                                finalDashboard?.parameters?.time_period;
                            expect(updatedFirstParam).to.exist;
                            expect(updatedFirstParam?.parameterName).to.eq(
                                'time_period',
                            );
                            expect(updatedFirstParam?.value).to.eq('monthly');

                            // Check second updated parameter
                            const updatedSecondParam =
                                finalDashboard?.parameters?.category;
                            expect(updatedSecondParam).to.exist;
                            expect(updatedSecondParam?.parameterName).to.eq(
                                'category',
                            );
                            expect(updatedSecondParam?.value).to.eq('premium');

                            // Check third updated parameter (array value)
                            const updatedThirdParam =
                                finalDashboard?.parameters?.markets;
                            expect(updatedThirdParam).to.exist;
                            expect(updatedThirdParam?.parameterName).to.eq(
                                'markets',
                            );
                            expect(updatedThirdParam?.value).to.deep.eq([
                                'APAC',
                                'Americas',
                            ]);
                        });
                    },
                );
            });
        });
    });

    describe('Dashboard slug support', () => {
        it('Should get dashboard by slug', () => {
            const slug = 'jaffle-dashboard';

            cy.request({
                method: 'GET',
                url: `${apiUrl}/dashboards/${slug}`,
            }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body.status).to.eq('ok');
                expect(response.body.results.name).to.eq('Jaffle dashboard');
                expect(response.body.results.slug).to.eq(slug);
            });
        });

        it('Should create and access dashboard by slug', () => {
            const projectUuid = SEED_PROJECT.project_uuid;
            const testDashboardName = `Test Dashboard ${Date.now()}`;

            createDashboard(projectUuid, {
                ...dashboardMock,
                name: testDashboardName,
            }).then((newDashboard) => {
                expect(newDashboard.slug).to.exist;

                // Access the dashboard by slug
                cy.request({
                    method: 'GET',
                    url: `${apiUrl}/dashboards/${newDashboard.slug}`,
                }).then((response) => {
                    expect(response.status).to.eq(200);
                    expect(response.body.results.uuid).to.eq(newDashboard.uuid);
                    expect(response.body.results.name).to.eq(testDashboardName);
                });

                // Clean up
                cy.deleteDashboardsByName([testDashboardName]);
            });
        });

        it('Should update dashboard accessed by slug', () => {
            const projectUuid = SEED_PROJECT.project_uuid;
            const testDashboardName = `Test Dashboard ${Date.now()}`;
            const updatedDescription = 'Updated via slug test';

            createDashboard(projectUuid, {
                ...dashboardMock,
                name: testDashboardName,
            }).then((newDashboard) => {
                // Update dashboard using slug
                cy.request({
                    method: 'PATCH',
                    url: `${apiUrl}/dashboards/${newDashboard.slug}`,
                    body: {
                        name: testDashboardName,
                        description: updatedDescription,
                    },
                }).then((updateResponse) => {
                    expect(updateResponse.status).to.eq(200);
                    expect(updateResponse.body.results.description).to.eq(
                        updatedDescription,
                    );

                    // Verify via UUID
                    cy.request({
                        method: 'GET',
                        url: `${apiUrl}/dashboards/${newDashboard.uuid}`,
                    }).then((verifyResponse) => {
                        expect(verifyResponse.body.results.description).to.eq(
                            updatedDescription,
                        );
                    });
                });

                // Clean up
                cy.deleteDashboardsByName([testDashboardName]);
            });
        });
    });
});
