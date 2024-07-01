import {
    ChartType,
    CreateSavedChart,
    DashboardTileTypes,
    SEED_PROJECT,
} from '@lightdash/common';
import warehouseConnections from '../../support/warehouses';
import { createChartAndUpdateDashboard, createDashboard } from './dashboard.cy';

const apiUrl = '/api/v1';

const chartMock: CreateSavedChart = {
    name: 'chart in dashboard',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_average_order_size'],
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

const checkPromotedChart = (promotedChart, upstreamChart) => {
    // Slug, metricQuery and chartConfig are not returend on /charts so we can't compare
    const equalProperties = ['name', 'spaceName', 'organizationUuid'];
    equalProperties.forEach((prop) => {
        expect(promotedChart[prop], `property ${prop}`).to.eq(
            upstreamChart[prop],
        );
    });

    const notEqualProperties = ['uuid', 'projectUuid', 'spaceUuid'];
    notEqualProperties.forEach((prop) => {
        expect(promotedChart[prop], `property ${prop}`).to.not.eq(
            upstreamChart[prop],
        );
    });
};

const checkPromotedDashboard = (promotedDashboard, upstreamDashboard) => {
    // Slug are not returend on /dashboards so we can't compare
    const equalProperties = ['name', 'spaceName', 'organizationUuid'];
    equalProperties.forEach((prop) => {
        expect(promotedDashboard[prop], `property ${prop}`).to.eq(
            upstreamDashboard[prop],
        );
    });
    if (promotedDashboard.tiles) {
        expect(promotedDashboard.tiles.length).to.be.eq(
            upstreamDashboard.tiles.length,
        );

        promotedDashboard.tiles.forEach((promotedTile, index) => {
            const upstreamTile = upstreamDashboard.tiles[index];
            expect(promotedTile.type).to.eq(upstreamTile.type);
            expect(promotedTile.properties.chartName).to.eq(
                upstreamTile.properties.chartName,
            );

            // Chart in dashboards should not have the same chart uuid
            if (promotedTile.properties.savedChartUuid !== undefined)
                expect(promotedTile.properties.savedChartUuid).to.not.eq(
                    upstreamTile.properties.savedChartUuid,
                );
            // Charts in space should have the `savedChartUuid` property set to null
            else
                expect(promotedTile.properties.savedChartUuid).to.eq(
                    upstreamTile.properties.savedChartUuid,
                );

            // FIXME this is currently broken
            // expect(promotedTile.uuid).to.not.eq(upstreamTile.uuid)
        });
    }

    const notEqualProperties = ['uuid', 'projectUuid', 'spaceUuid'];
    notEqualProperties.forEach((prop) => {
        expect(promotedDashboard[prop], `property ${prop}`).to.not.eq(
            upstreamDashboard[prop],
        );
    });
};

describe('Promotion charts and dashboards', () => {
    const upstreamProjectName = `Upstream project ${Date.now()}`;
    let upstreamProjectUuid: string;
    beforeEach(() => {
        cy.login();
    });
    before('create upstream project', () => {
        cy.login();

        cy.createProject(
            upstreamProjectName,
            warehouseConnections.postgresSQL,
        ).then((projectUuid) => {
            upstreamProjectUuid = projectUuid;
        });
    });

    after('delete upstream project', () => {
        cy.log(`Deleting project by name ${upstreamProjectName}`);
        cy.deleteProjectsByName([upstreamProjectName]);
        // After deleting upstream project, the seed project upstreamProjectUuid should be undefined
    });

    it('Set upstream project on seed project', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/metadata`,
            headers: { 'Content-type': 'application/json' },
            method: 'PATCH',
            body: {
                upstreamProjectUuid,
            },
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    });

    it('Promote existing chart in space', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
            method: 'GET',
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length.greaterThan(0);
            const chart = resp.body.results.find(
                (c) => c.name === 'How many orders we have over time ?',
            );

            cy.request({
                url: `${apiUrl}/saved/${chart.uuid}/promote`,
                method: 'POST',
            }).then((promoteResponse) => {
                expect(promoteResponse.status).to.eq(200);
                const upstreamChart = promoteResponse.body.results;

                checkPromotedChart(chart, upstreamChart);

                // Promote again
                cy.request({
                    url: `${apiUrl}/saved/${chart.uuid}/promote`,
                    method: 'POST',
                }).then((pr) => {
                    expect(pr.status).to.eq(200);
                });
            });
        });
    });

    it('Promote new chart in new space', () => {
        const now = Date.now();
        cy.createSpace(
            SEED_PROJECT.project_uuid,
            `Public space to promote ${now}`,
        ).then((spaceUuid) => {
            cy.createChartInSpace(SEED_PROJECT.project_uuid, {
                ...chartMock,
                name: `Chart to promote ${now}`,
                spaceUuid,
                dashboardUuid: null,
            }).then((chart) => {
                cy.request({
                    url: `${apiUrl}/saved/${chart.uuid}/promote`,
                    method: 'POST',
                }).then((promoteResponse) => {
                    expect(promoteResponse.status).to.eq(200);
                    const upstreamChart = promoteResponse.body.results;

                    checkPromotedChart(chart, upstreamChart);
                    // Promote again
                    cy.request({
                        url: `${apiUrl}/saved/${chart.uuid}/promote`,
                        method: 'POST',
                    }).then((pr) => {
                        expect(pr.status).to.eq(200);
                    });
                });
            });
        });
    });

    /*
    //Depends on open PR 
    it.only('Promotion diff for existing chart in space', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
            method: 'GET',
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length.greaterThan(0);
            const chart = resp.body.results.find(
                (c) => c.name === 'How many orders we have over time ?',
            );

            cy.request({
                url: `${apiUrl}/saved/${chart.uuid}/promoteDiff`,
                method: 'POST',
            }).then((promoteResponse) => {
                expect(promoteResponse.status).to.eq(200);
                const diff = promoteResponse.body.results;
                expect(diff.charts).to.be.gt(0);
            });
        });
    }); */

    it('Promote existing dashboard in space', () => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
            method: 'GET',
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length.greaterThan(0);
            const dashboard = resp.body.results.find(
                (c) => c.name === 'Jaffle dashboard',
            );

            cy.request({
                url: `${apiUrl}/dashboards/${dashboard.uuid}/promote`,
                method: 'POST',
            }).then((promoteResponse) => {
                expect(promoteResponse.status).to.eq(200);
                const upstreamDashboard = promoteResponse.body.results;

                checkPromotedDashboard(
                    {
                        spaceName: 'Jaffle shop', // not returned in the list of dashboards
                        ...dashboard,
                    },
                    upstreamDashboard,
                );

                // Promote again
                cy.request({
                    url: `${apiUrl}/dashboards/${dashboard.uuid}/promote`,
                    method: 'POST',
                }).then((pr) => {
                    expect(pr.status).to.eq(200);
                });
            });
        });
    });

    it('Promote new dashboard', () => {
        // Steps:
        // 1. Create a new space
        // 2. Create a new chart in the space
        // 3. Create a new dashboard with the chart
        // 4. Create chart within dashboard
        // 5. Promote the dashboard
        const now = Date.now();
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.createSpace(projectUuid, `Public space to promote ${now}`).then(
            (spaceUuid) => {
                cy.createChartInSpace(projectUuid, {
                    ...chartMock,
                    name: `Chart to promote ${now}`,
                    spaceUuid,
                    dashboardUuid: null,
                }).then((chart) => {
                    // TODO move createDashboard to cypress commands
                    createDashboard(projectUuid, {
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
                    }).then((newDashboard) => {
                        expect(newDashboard.tiles.length).to.eq(1);

                        createChartAndUpdateDashboard(
                            projectUuid,
                            {
                                ...chartMock,
                                name: `Chart in dashboard to promote ${now}`,
                                dashboardUuid: newDashboard.uuid,
                                spaceUuid: null,
                            },
                            newDashboard,
                        ).then(({ dashboard: updatedDashboard }) => {
                            expect(updatedDashboard.tiles.length).to.eq(2);
                            cy.request({
                                url: `${apiUrl}/dashboards/${updatedDashboard.uuid}/promote`,
                                method: 'POST',
                            }).then((promoteResponse) => {
                                expect(promoteResponse.status).to.eq(200);
                                const upstreamDashboard =
                                    promoteResponse.body.results;
                                checkPromotedDashboard(
                                    updatedDashboard,
                                    upstreamDashboard,
                                );

                                // Promote again
                                cy.request({
                                    url: `${apiUrl}/dashboards/${updatedDashboard.uuid}/promote`,
                                    method: 'POST',
                                }).then((pr) => {
                                    expect(pr.status).to.eq(200);
                                });
                            });
                        });
                    });
                });
            },
        );
    });

    // TODO check dashboard diff
});
