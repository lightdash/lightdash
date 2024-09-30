import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('Lightdash pinning endpoints', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Should pin/unpin chart', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
            (projectResponse) => {
                const savedChart = projectResponse.body.results[0];

                expect(savedChart.pinnedListUuid).to.eq(null);

                // Pin Chart
                cy.request(
                    'PATCH',
                    `${apiUrl}/saved/${savedChart.uuid}/pinning`,
                ).then((updatedChartResponse) => {
                    cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
                        (res1) => {
                            expect(res1.body.results[0].pinnedListUuid).to.eq(
                                updatedChartResponse.body.results
                                    .pinnedListUuid,
                            );
                        },
                    );
                });

                // Unpin chart
                cy.request(
                    'PATCH',
                    `${apiUrl}/saved/${savedChart.uuid}/pinning`,
                ).then(() => {
                    cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
                        (res2) => {
                            expect(res2.body.results[0].pinnedListUuid).to.eq(
                                null,
                            );
                        },
                    );
                });
            },
        );
    });
    it('Should pin/unpin dashboard', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (projectResponse) => {
                const dashboard = projectResponse.body.results[0];

                // Pin dashboard
                cy.request(
                    'PATCH',
                    `${apiUrl}/dashboards/${dashboard.uuid}/pinning`,
                ).then((updatedDashboardResponse) => {
                    cy.request(
                        `${apiUrl}/projects/${projectUuid}/dashboards`,
                    ).then((res1) => {
                        expect(res1.body.results[0].pinnedListUuid).to.eq(
                            updatedDashboardResponse.body.results
                                .pinnedListUuid,
                        );
                    });
                });
                // Unpin dashboard
                cy.request(
                    'PATCH',
                    `${apiUrl}/dashboards/${dashboard.uuid}/pinning`,
                ).then(() => {
                    cy.request(
                        `${apiUrl}/projects/${projectUuid}/dashboards`,
                    ).then((res1) => {
                        expect(res1.body.results[0].pinnedListUuid).to.eq(null);
                    });
                });
            },
        );
    });
});
