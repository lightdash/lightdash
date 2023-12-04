import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

const createChart = async (fieldX: string, fieldY: string) =>
    new Promise((resolve) => {
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
            method: 'POST',
            body: {
                name: `Chart ${fieldX} x ${fieldY}`,
                description: ``,
                tableName: 'payments',
                metricQuery: {
                    dimensions: [fieldX],
                    metrics: [fieldY],
                    filters: {},
                    sorts: [
                        {
                            fieldId: fieldX,
                            descending: true,
                        },
                    ],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                    customDimensions: [],
                },
                chartConfig: {
                    type: 'cartesian',
                    config: {
                        layout: {
                            flipAxes: false,
                            xField: fieldX,
                            yField: [fieldY],
                        },
                        eChartsConfig: {
                            series: [
                                {
                                    encode: {
                                        xRef: { field: fieldX },
                                        yRef: {
                                            field: fieldY,
                                        },
                                    },
                                    type: 'bar',
                                    yAxisIndex: 0,
                                },
                            ],
                        },
                    },
                },
                tableConfig: {
                    columnOrder: [fieldX, fieldY],
                },
                pivotConfig: {
                    columns: [],
                },
            },
        }).then((r) => {
            expect(r.status).to.eq(200);
            resolve(r.body.results.uuid);
        });
    });

describe('Date zoom', () => {
    beforeEach(() => {
        cy.login();
    });

    it('I can use date zoom', () => {
        // This barSelector will select all the blue bars in the chart
        const barSelector = 'path[fill="#5470c6"]';

        createChart('orders_order_date_day', 'orders_total_order_amount').then(
            (chartUuid) => {
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
                    method: 'POST',
                    body: {
                        name: 'zoom test',
                        description: '',
                        tiles: [],
                    },
                }).then((r) => {
                    const dashboardUuid = r.body.results.uuid;
                    cy.request({
                        url: `${apiUrl}/dashboards/${dashboardUuid}`,
                        method: 'PATCH',
                        body: {
                            tiles: [
                                {
                                    uuid: chartUuid,
                                    type: 'saved_chart',
                                    properties: {
                                        belongsToDashboard: false,
                                        savedChartUuid: chartUuid,
                                        chartName: 'test',
                                    },
                                    h: 9,
                                    w: 15,
                                    x: 0,
                                    y: 0,
                                },
                            ],
                            filters: {
                                dimensions: [],
                                metrics: [],
                                tableCalculations: [],
                            },
                            name: 'zoom test',
                        },
                    });

                    cy.visit(
                        `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}`,
                    );

                    // Wait until the chart appears
                    cy.contains('zoom test'); // dashboard title
                    cy.contains(
                        'Chart orders_order_date_day x orders_total_order_amount',
                    ); // Chart title
                    cy.contains('Total order amount'); // axis label

                    // Count how many bars appear in the chart
                    cy.get(barSelector).should('have.length', 69); // default chart time frame is day

                    cy.contains('Date Zoom').click();
                    cy.contains('Month').click();
                    cy.get(barSelector).should('have.length', 4);

                    cy.contains('Date Zoom').click();
                    cy.contains('Day').click();
                    cy.get(barSelector).should('have.length', 69);

                    cy.contains('Date Zoom').click();
                    cy.contains('Week').click();
                    cy.get(barSelector).should('have.length', 15);

                    cy.contains('Date Zoom').click();
                    cy.contains('Quarter').click();
                    cy.get(barSelector).should('have.length', 2);

                    cy.contains('Date Zoom').click();
                    cy.contains('Year').click();
                    cy.get(barSelector).should('have.length', 1);

                    cy.contains('Date Zoom').click();
                    cy.contains('Default').click();
                    cy.get(barSelector).should('have.length', 69); // back to default (day)
                });
            },
        );
    });
});
