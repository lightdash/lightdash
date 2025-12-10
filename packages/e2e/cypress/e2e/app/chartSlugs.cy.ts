import { SEED_PROJECT } from '@lightdash/common';

describe.skip('Chart Slugs', () => {
    beforeEach(() => {
        cy.login();
    });

    // TODO: remove
    it.skip('Should access saved chart by slug instead of UUID', () => {
        // Navigate to the chart list
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/saved`);

        // Find and click on a chart
        cy.contains(
            'a',
            'How much revenue do we have per payment method?',
        ).click();

        // Get the UUID from the URL
        cy.url().then((urlWithUuid) => {
            const uuidMatch = urlWithUuid.match(/\/saved\/([^/?]+)/);
            const chartUuid = uuidMatch ? uuidMatch[1] : '';
            void expect(chartUuid).to.not.be.empty;

            // Now navigate to the chart using slug
            const slug = 'how-much-revenue-do-we-have-per-payment-method';
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/saved/${slug}`);

            // Verify the chart loads correctly
            cy.findByText(
                'How much revenue do we have per payment method?',
            ).should('exist');

            cy.findAllByText('Loading chart').should('have.length', 0);

            // Verify URL contains the slug
            cy.url().should('include', `/saved/${slug}`);

            // Verify chart renders
            cy.get('.echarts-for-react').should('have.length', 1);
        });
    });

    // TODO: remove
    it.skip('Should edit chart accessed by slug', () => {
        const slug = 'how-much-revenue-do-we-have-per-payment-method';
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/saved/${slug}`);

        cy.findAllByText('Loading chart').should('have.length', 0);

        // Click edit
        cy.contains('Edit chart').click();

        // Wait for explorer to load
        cy.contains('Run query').should('exist');

        // Verify we're in edit mode
        cy.url().should('include', '/edit');
    });

    // todo: move to api tests
    it.skip('Should access chart via API using slug', () => {
        const slug = 'how-much-revenue-do-we-have-per-payment-method';

        // Test API endpoint with slug
        cy.request({
            method: 'GET',
            url: `/api/v1/saved/${slug}`,
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.have.property('status', 'ok');
            expect(response.body.results).to.have.property(
                'name',
                'How much revenue do we have per payment method?',
            );
            expect(response.body.results).to.have.property('slug', slug);
            expect(response.body.results).to.have.property('uuid');
            expect(response.body.results).to.have.property('metricQuery');
        });
    });

    // todo: remove
    it.skip('Should handle invalid chart slug gracefully', () => {
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/saved/non-existent-chart-slug`,
            { failOnStatusCode: false },
        );

        // Should show an error message (either "Chart not found" or similar)
        cy.findByText(/not found|does not exist/i).should('exist');
    });

    // todo: remove
    it.skip('Should run chart query using slug', () => {
        const slug = 'how-much-revenue-do-we-have-per-payment-method';
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/saved/${slug}`);

        cy.findAllByText('Loading chart').should('have.length', 0);

        // Verify chart renders with data
        cy.get('.echarts-for-react').should('have.length', 1);

        // Verify data in results table view
        cy.contains('Results').click();

        // Should have payment method data
        cy.contains('credit_card').should('exist');
        cy.contains('bank_transfer').should('exist');
    });
});
