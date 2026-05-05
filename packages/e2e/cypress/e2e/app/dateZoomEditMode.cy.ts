import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

const createBigNumberChart = (
    fieldX: string,
    fieldY: string,
): Cypress.Chainable<string> =>
    cy
        .request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
            method: 'POST',
            body: {
                name: `Big number ${fieldX} x ${fieldY}`,
                description: '',
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
                    type: 'big_number',
                    config: {
                        label: 'Date zoom revenue',
                    },
                },
                tableConfig: {
                    columnOrder: [fieldX, fieldY],
                },
                pivotConfig: {
                    columns: [],
                },
            },
        })
        .then((response) => {
            expect(response.status).to.eq(200);
            return response.body.results.uuid;
        });

const createDashboardWithChart = (
    name: string,
    chartUuid: string,
): Cypress.Chainable<string> =>
    cy
        .request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
            method: 'POST',
            body: {
                name,
                description: '',
                tiles: [],
                tabs: [],
            },
        })
        .then((response) => {
            expect(response.status).to.eq(201);

            const dashboardUuid = response.body.results.uuid;
            return cy
                .request({
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
                                    chartName: name,
                                },
                                h: 9,
                                w: 15,
                                x: 0,
                                y: 0,
                                tabUuid: null,
                            },
                        ],
                        filters: {
                            dimensions: [],
                            metrics: [],
                            tableCalculations: [],
                        },
                        tabs: [],
                        name,
                    },
                })
                .then((patchResponse) => {
                    expect(patchResponse.status).to.eq(200);
                    return dashboardUuid;
                });
        });

describe('Date zoom edit mode', () => {
    beforeEach(() => {
        cy.login();
    });

    it('preserves URL date zoom on initial load and when entering edit mode', () => {
        createBigNumberChart(
            'orders_order_date_month',
            'payments_total_revenue',
        ).then((chartUuid) => {
            createDashboardWithChart(
                'date zoom edit mode big number',
                chartUuid,
            ).then((dashboardUuid) => {
                let requestCountBeforeEdit = 0;

                cy.intercept(
                    'POST',
                    `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/dashboard-chart`,
                ).as('dashboardChartQuery');

                cy.visit(
                    `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}/view?dateZoom=day`,
                );

                cy.contains('date zoom edit mode big number');
                cy.wait('@dashboardChartQuery', { timeout: 60000 }).then(
                    ({ request }) => {
                        expect(request.body.chartUuid).to.eq(chartUuid);
                        expect(request.body.dateZoom).to.deep.eq({
                            granularity: 'Day',
                        });
                    },
                );

                cy.get('@dashboardChartQuery.all').then((interceptions) => {
                    requestCountBeforeEdit = interceptions.length;
                });

                cy.findByLabelText('Edit dashboard').click();
                cy.url().should('include', '/edit');
                cy.findByRole('button', { name: 'Save changes' }).should(
                    'be.visible',
                );

                cy.wait(10000);
                cy.get('@dashboardChartQuery.all').should((interceptions) => {
                    const requestsAfterEdit = interceptions
                        .slice(requestCountBeforeEdit)
                        .filter(
                            ({ request }) =>
                                request.body.chartUuid === chartUuid,
                        );
                    const emptyDateZoomRequests = requestsAfterEdit.filter(
                        ({ request }) =>
                            JSON.stringify(request.body.dateZoom) === '{}',
                    );

                    expect(
                        emptyDateZoomRequests,
                        JSON.stringify(
                            requestsAfterEdit.map(({ request }) => ({
                                dateZoom: request.body.dateZoom,
                            })),
                        ),
                    ).to.have.length(0);
                });
            });
        });
    });
});
