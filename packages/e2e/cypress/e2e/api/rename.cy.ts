import { RenameType, SEED_PROJECT } from '@lightdash/common';
import { chartMock } from '../../support/mocks';

describe('Rename Chart API', () => {
    const apiUrl = '/api/v1';

    beforeEach(() => {
        cy.login();
    });

    it('Should rename a chart field and check the response', () => {
        const now = Date.now();
        // Create a new chart using the API

        cy.createSpace(
            SEED_PROJECT.project_uuid,
            `Public space to promote ${now}`,
        ).then((spaceUuid) => {
            cy.createChartInSpace(SEED_PROJECT.project_uuid, {
                ...chartMock,
                name: `Chart to rename ${now} field`,
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_type'],
                    metrics: [],
                    filters: {},
                    sorts: [
                        {
                            fieldId: 'orders_type',
                            descending: false,
                        },
                    ],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                },
                spaceUuid,
                dashboardUuid: null,
            }).then((chart) => {
                const chartUuid = chart.uuid;
                const renamePayload = {
                    from: 'orders_type',
                    to: 'orders_status',
                    type: RenameType.FIELD,
                };

                cy.request(
                    'POST',
                    `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/rename/chart/${chartUuid}`,
                    renamePayload,
                ).then((response) => {
                    expect(response.status).to.eq(200);
                    expect(response.body).to.have.property('status', 'ok');

                    cy.request('GET', `${apiUrl}/saved/${chartUuid}`).then(
                        (getResponse) => {
                            cy.log(getResponse.body);
                            expect(getResponse.status).to.eq(200);
                            expect(getResponse.body).to.have.property(
                                'status',
                                'ok',
                            );
                            const updatedChart = getResponse.body.results;
                            expect(updatedChart.metricQuery.exploreName).to.eq(
                                'orders',
                            );

                            expect(
                                updatedChart.metricQuery.dimensions,
                            ).to.include('orders_status');
                            expect(
                                updatedChart.metricQuery.sorts[0].fieldId,
                            ).to.eq('orders_status');
                        },
                    );

                    // Clean up: delete the created chart
                    cy.request('DELETE', `${apiUrl}/saved/${chartUuid}`).then(
                        (delres) => {
                            expect(delres.status).to.eq(200);
                        },
                    );
                });
            });
        });
    });

    it('Should rename a chart model and check the response', () => {
        const now = Date.now();
        // Create a new chart using the API

        cy.createSpace(
            SEED_PROJECT.project_uuid,
            `Public space to promote ${now}`,
        ).then((spaceUuid) => {
            cy.createChartInSpace(SEED_PROJECT.project_uuid, {
                ...chartMock,
                name: `Chart to rename ${now} model`,
                metricQuery: {
                    exploreName: 'purchases',
                    dimensions: ['purchases_type'],
                    metrics: [],
                    filters: {},
                    sorts: [
                        {
                            fieldId: 'purchases_type',
                            descending: false,
                        },
                    ],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                },
                spaceUuid,
                dashboardUuid: null,
            }).then((chart) => {
                const chartUuid = chart.uuid;
                const renamePayload = {
                    from: 'purchases',
                    to: 'orders',
                    type: RenameType.MODEL,
                };

                cy.request(
                    'POST',
                    `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/rename/chart/${chartUuid}`,
                    renamePayload,
                ).then((response) => {
                    expect(response.status).to.eq(200);
                    expect(response.body).to.have.property('status', 'ok');

                    cy.request('GET', `${apiUrl}/saved/${chartUuid}`).then(
                        (getResponse) => {
                            expect(getResponse.status).to.eq(200);
                            expect(getResponse.body).to.have.property(
                                'status',
                                'ok',
                            );
                            const updatedChart = getResponse.body.results;
                            expect(updatedChart.metricQuery.exploreName).to.eq(
                                'orders',
                            );

                            expect(
                                updatedChart.metricQuery.dimensions,
                            ).to.include('orders_type');
                            expect(
                                updatedChart.metricQuery.sorts[0].fieldId,
                            ).to.eq('orders_type');
                        },
                    );

                    cy.request('DELETE', `${apiUrl}/saved/${chartUuid}`).then(
                        (delres) => {
                            expect(delres.status).to.eq(200);
                        },
                    );
                });

                // Clean up: delete the created chart
            });
        });
    });

    after(() => {});
});
