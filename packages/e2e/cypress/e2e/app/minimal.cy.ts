import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('Minimal pages', () => {
    beforeEach(() => {
        cy.login();
    });
    it('I can view a minimal chart', () => {
        cy.request(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces-and-content`,
        ).then((projectResponse) => {
            const savedChart = projectResponse.body.results
                .find((s) => s.name === SEED_PROJECT.name)

                .queries.find(
                    (s) =>
                        s.name ===
                        'How much revenue do we have per payment method?',
                );

            cy.visit(
                `/minimal/projects/${SEED_PROJECT.project_uuid}/saved/${savedChart.uuid}`,
            );

            cy.get('.echarts-for-react').should('exist');
            cy.contains('Payment method');
            cy.contains('Total revenue');
        });
    });

    it('I can view a minimal table', () => {
        cy.request(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces-and-content`,
        ).then((projectResponse) => {
            const savedChart = projectResponse.body.results
                .find((s) => s.name === SEED_PROJECT.name)

                .queries.find(
                    (s) =>
                        s.name ===
                        'Which customers have not recently ordered an item?',
                );

            cy.visit(
                `/minimal/projects/${SEED_PROJECT.project_uuid}/saved/${savedChart.uuid}`,
            );

            cy.get('table').within(() => {
                cy.contains('Days between created and first order');
                cy.contains('Total revenue');
            });
        });
    });

    it('I can view a minimal big number', () => {
        cy.request(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces-and-content`,
        ).then((projectResponse) => {
            const savedChart = projectResponse.body.results
                .find((s) => s.name === SEED_PROJECT.name)

                .queries.find(
                    (s) => s.name === `What's our total revenue to date?`,
                );

            cy.visit(
                `/minimal/projects/${SEED_PROJECT.project_uuid}/saved/${savedChart.uuid}`,
            );

            cy.contains('Payments total revenue');
            cy.contains('1,103');
        });
    });
    it('I can view a minimal dashboard', () => {
        cy.request(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces-and-content`,
        ).then((projectResponse) => {
            const dashboard = projectResponse.body.results
                .find((s) => s.name === SEED_PROJECT.name)
                .dashboards.find((s) => s.name === `Jaffle dashboard`);

            cy.visit(
                `/minimal/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboard.uuid}`,
            );

            // cy.contains('Jaffle dashboard') // minimal doesn't show titles

            cy.contains('Welcome to Lightdash!'); // markdown
            cy.contains(
                'Lightdash is an open source analytics for your dbt project.',
            ); // markdown

            cy.contains('1,103'); // big number

            cy.contains(`What's the average spend per customer?`); // bar chart
            cy.contains('Average order size'); // bar chart

            cy.contains('Which customers have not recently ordered an item?'); // table chart
            cy.contains('Days between created and first order'); // table chart
        });
    });
});
