import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('Pinning endpoints', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Should pin/unpin chart', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/charts`).then(
            (projectResponse) => {
                const savedChart = projectResponse.body.results[0];

                // change once
                cy.request(
                    'PATCH',
                    `${apiUrl}/saved/${savedChart.uuid}/pinning`,
                ).then((updatedChartResponse) => {
                    expect(
                        updatedChartResponse.body.results.pinnedListUuid,
                    ).to.not.eq(savedChart.pinnedListUuid);
                });

                // change back
                cy.request(
                    'PATCH',
                    `${apiUrl}/saved/${savedChart.uuid}/pinning`,
                ).then((updatedChartResponse) => {
                    expect(
                        updatedChartResponse.body.results.pinnedListUuid,
                    ).to.eq(savedChart.pinnedListUuid);
                });
            },
        );
    });
    it('Should pin/unpin dashboard', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(`${apiUrl}/projects/${projectUuid}/dashboards`).then(
            (projectResponse) => {
                const dashboard = projectResponse.body.results[0];

                // change once
                cy.request(
                    'PATCH',
                    `${apiUrl}/dashboards/${dashboard.uuid}/pinning`,
                ).then((updatedDashboardResponse) => {
                    expect(
                        updatedDashboardResponse.body.results.pinnedListUuid,
                    ).to.not.eq(dashboard.pinnedListUuid);
                });
                // change back
                cy.request(
                    'PATCH',
                    `${apiUrl}/dashboards/${dashboard.uuid}/pinning`,
                ).then((updatedDashboardResponse) => {
                    // check value was updated back to original
                    expect(
                        updatedDashboardResponse.body.results.pinnedListUuid,
                    ).to.eq(dashboard.pinnedListUuid);
                });
            },
        );
    });
});
