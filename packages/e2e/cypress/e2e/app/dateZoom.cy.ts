import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

// All blue bars in an ECharts cartesian chart.
const barSelector = 'path[fill="#5470c6"]';

const emptyFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

// Create a standalone bar chart over a day-grained date dimension. Returns the
// chart uuid as a Cypress chainable so the rest of the flow stays inside the
// command queue (a floating native Promise here would let the test "pass"
// without ever running its assertions).
const createDateChart = (name: string) =>
    cy
        .request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
            method: 'POST',
            body: {
                name,
                description: '',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_order_date_day'],
                    metrics: ['orders_total_order_amount'],
                    filters: {},
                    sorts: [
                        { fieldId: 'orders_order_date_day', descending: true },
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
                            xField: 'orders_order_date_day',
                            yField: ['orders_total_order_amount'],
                        },
                        eChartsConfig: {
                            series: [
                                {
                                    encode: {
                                        xRef: {
                                            field: 'orders_order_date_day',
                                        },
                                        yRef: {
                                            field: 'orders_total_order_amount',
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
                    columnOrder: [
                        'orders_order_date_day',
                        'orders_total_order_amount',
                    ],
                },
                pivotConfig: { columns: [] },
            },
        })
        .then((r) => {
            expect(r.status).to.eq(200);
            return r.body.results.uuid as string;
        });

const chartTile = (chartUuid: string, chartName: string) => ({
    uuid: chartUuid,
    type: 'saved_chart',
    properties: {
        belongsToDashboard: false,
        savedChartUuid: chartUuid,
        chartName,
    },
    h: 9,
    w: 15,
    x: 0,
    y: 0,
});

const visitDashboard = (dashboardUuid: string) =>
    cy.visit(
        `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}`,
    );

// Bar counts depend on seed row counts, so assert on granularity ordering
// (coarser grain => fewer bars) instead of brittle absolute numbers.
const expectBarCount = (assert: (count: number) => void) =>
    cy.get(barSelector).should(($bars) => {
        assert($bars.length);
    });

describe('Date zoom', () => {
    beforeEach(() => {
        cy.login();
    });

    it('applies the Default date zoom picker to a chart', () => {
        const chartName = 'Date zoom default chart';
        const selectDefaultGrain = (grain: string) => {
            cy.contains('Default zoom').click();
            cy.contains(grain).click();
        };

        createDateChart(chartName).then((chartUuid) => {
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
                method: 'POST',
                body: {
                    name: 'zoom test',
                    description: '',
                    tiles: [],
                    tabs: [],
                },
            }).then((r) => {
                const dashboardUuid = r.body.results.uuid;
                cy.request({
                    url: `${apiUrl}/dashboards/${dashboardUuid}`,
                    method: 'PATCH',
                    body: {
                        name: 'zoom test',
                        tiles: [chartTile(chartUuid, chartName)],
                        tabs: [],
                        filters: emptyFilters,
                    },
                }).then(() => {
                    visitDashboard(dashboardUuid);

                    cy.contains('zoom test'); // dashboard title
                    cy.contains(chartName); // chart tile title

                    // The chart's own granularity is day.
                    let dayCount = 0;
                    let monthCount = 0;
                    cy.get(barSelector)
                        .should('have.length.greaterThan', 0)
                        .then(($bars) => {
                            dayCount = $bars.length;
                        });

                    // Month is coarser than day => fewer bars.
                    selectDefaultGrain('Month');
                    expectBarCount((count) => {
                        expect(count).to.be.greaterThan(0);
                        expect(count).to.be.lessThan(dayCount);
                    });
                    cy.get(barSelector).then(($bars) => {
                        monthCount = $bars.length;
                    });

                    // Week sits between month and day.
                    selectDefaultGrain('Week');
                    expectBarCount((count) => {
                        expect(count).to.be.greaterThan(monthCount);
                        expect(count).to.be.lessThan(dayCount);
                    });

                    // Year is the coarsest => fewer bars than month.
                    selectDefaultGrain('Year');
                    expectBarCount((count) => {
                        expect(count).to.be.greaterThan(0);
                        expect(count).to.be.lessThan(monthCount);
                    });

                    // None resets back to the chart's native day granularity.
                    // Read dayCount inside the callback so it is evaluated at
                    // run time (after it was captured), not at queue-build time.
                    selectDefaultGrain('None');
                    expectBarCount((count) => {
                        expect(count).to.equal(dayCount);
                    });
                });
            });
        });
    });

    it('applies a named control grain to its attached tile and supports runtime override', () => {
        const chartName = 'Date zoom control chart';
        const controlUuid = crypto.randomUUID();
        const controlName = 'Revenue zoom';

        createDateChart(chartName).then((chartUuid) => {
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
                method: 'POST',
                body: {
                    name: 'control zoom test',
                    description: '',
                    tiles: [],
                    tabs: [],
                },
            }).then((r) => {
                const dashboardUuid = r.body.results.uuid;
                cy.request({
                    url: `${apiUrl}/dashboards/${dashboardUuid}`,
                    method: 'PATCH',
                    body: {
                        name: 'control zoom test',
                        tiles: [chartTile(chartUuid, chartName)],
                        tabs: [],
                        filters: emptyFilters,
                        config: {
                            isDateZoomDisabled: false,
                            dateZoomConfig: {
                                controls: [
                                    {
                                        uuid: controlUuid,
                                        name: controlName,
                                        granularity: 'Month',
                                    },
                                ],
                                tileTargets: {
                                    [chartUuid]: {
                                        controlUuid,
                                        fieldId: 'orders_order_date_day',
                                        tableName: 'orders',
                                    },
                                },
                            },
                        },
                    },
                }).then(() => {
                    visitDashboard(dashboardUuid);

                    cy.contains('control zoom test');
                    cy.contains(chartName);

                    // The persisted control renders as a pill at its saved
                    // grain (Month), applied on load without the Default picker.
                    cy.contains(controlName).should('contain.text', 'Month');

                    let monthCount = 0;
                    cy.get(barSelector)
                        .should('have.length.greaterThan', 0)
                        .then(($bars) => {
                            monthCount = $bars.length;
                        });

                    // A viewer overrides the control grain at runtime via its
                    // pill; Week is finer than Month => more bars.
                    cy.contains(controlName).click();
                    cy.contains('Week').click();
                    expectBarCount((count) => {
                        expect(count).to.be.greaterThan(monthCount);
                    });

                    // Reset returns the control to its persisted default (Month).
                    // Read monthCount inside the callback so it is evaluated at
                    // run time (after it was captured), not at queue-build time.
                    cy.contains(controlName).click();
                    cy.contains('Reset to default').click();
                    expectBarCount((count) => {
                        expect(count).to.equal(monthCount);
                    });
                });
            });
        });
    });
});
