import { SCREENSHOT_READY_INDICATOR_ID, SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('Minimal pages', () => {
    beforeEach(() => {
        cy.login();
    });
    it('I can view a minimal chart', () => {
        cy.request(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
        ).then((projectResponse) => {
            const savedChart = projectResponse.body.results.find(
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
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
        ).then((projectResponse) => {
            const savedChart = projectResponse.body.results.find(
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
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/charts`,
        ).then((projectResponse) => {
            const savedChart = projectResponse.body.results.find(
                (s) => s.name === `What's our total revenue to date?`,
            );

            cy.visit(
                `/minimal/projects/${SEED_PROJECT.project_uuid}/saved/${savedChart.uuid}`,
            );

            cy.contains('Payments total revenue');
            cy.contains('1,682');
        });
    });
    it('I can view a minimal dashboard', () => {
        cy.request(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        ).then((projectResponse) => {
            const dashboard = projectResponse.body.results.find(
                (s) => s.name === `Jaffle dashboard`,
            );

            cy.visit(
                `/minimal/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboard.uuid}`,
            );

            // cy.contains('Jaffle dashboard') // minimal doesn't show titles

            cy.contains('Welcome to Lightdash!'); // markdown
            cy.contains(
                'Lightdash is an open source analytics for your dbt project.',
            ); // markdown

            cy.contains('1,682'); // big number

            cy.contains(`What's the average spend per customer?`); // bar chart
            cy.contains('Average order size'); // bar chart

            cy.contains('Which customers have not recently ordered an item?'); // table chart
            cy.contains('Days between created and first order'); // table chart
        });
    });

    it('Screenshot ready indicator works with edge cases (orphan tiles, empty results, errors)', () => {
        // Uses hardcoded dashboard from seed: 08_scheduled_delivery_edge_cases_dashboard.ts
        // Contains: 1 bar chart, 1 orphan tile, 1 empty results table, 1 table with invalid metric
        const edgeCasesDashboardUuid = '4f34f5a2-93df-4e5b-a6f1-b6167b19a8ba';

        cy.visit(
            `/minimal/projects/${SEED_PROJECT.project_uuid}/dashboards/${edgeCasesDashboardUuid}`,
        );

        // Wait for screenshot ready indicator to appear (max 30s for slow queries)
        cy.get(`#${SCREENSHOT_READY_INDICATOR_ID}`, { timeout: 30000 }).should(
            'exist',
        );

        // Verify the indicator has expected data attributes
        cy.get(`#${SCREENSHOT_READY_INDICATOR_ID}`).should(
            'have.attr',
            'data-tiles-total',
            '4',
        );

        // Should have some errored tiles (orphan + invalid metric)
        cy.get(`#${SCREENSHOT_READY_INDICATOR_ID}`)
            .invoke('attr', 'data-tiles-errored')
            .then((errored) => {
                expect(Number(errored)).to.be.greaterThan(0);
            });

        // Verify status is completed-with-errors (due to orphan/error tiles)
        cy.get(`#${SCREENSHOT_READY_INDICATOR_ID}`).should(
            'have.attr',
            'data-status',
            'completed-with-errors',
        );
    });
});
