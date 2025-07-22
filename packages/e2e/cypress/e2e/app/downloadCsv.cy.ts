import { SEED_PROJECT } from '@lightdash/common';

describe('Download CSV on Dashboards', () => {
    beforeEach(() => {
        cy.login();

        cy.on('url:changed', (newUrl) => {
            if (newUrl.includes('.csv')) {
                window.location.href = '/';
            }
        });

        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`, {
            timeout: 60000,
        });
    });

    it('Should download a CSV from dashboard', () => {
        const downloadUrl = `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/*/download`;

        cy.intercept({
            method: 'POST',
            url: downloadUrl,
        }).as('apiDownload');

        // wait for the dashboard to load
        cy.findByText('Loading dashboards').should('not.exist');

        cy.contains('a', 'Jaffle dashboard').click();

        cy.findByTestId('page-spinner').should('not.exist');

        cy.findAllByText('No chart available').should('have.length', 0);
        cy.findAllByText('No data available').should('have.length', 0);

        cy.get('thead th').should('have.length', 6); // Table chart
        cy.contains('Days since').trigger('mouseenter');

        cy.findByTestId('tile-icon-more').click();
        cy.get('button').contains('Download data').click();

        cy.get('[data-testid=chart-export-results-button]').should(
            'be.visible',
        );
        cy.get('[data-testid=chart-export-results-button]').click();

        cy.wait('@apiDownload', { timeout: 3000 }).then((interception) => {
            expect(interception?.response?.statusCode).to.eq(200);
            expect(interception?.response?.body.results).to.have.property(
                'fileUrl',
            );
        });
    });
});

describe('Download CSV on Explore', () => {
    beforeEach(() => {
        cy.login();

        cy.on('url:changed', (newUrl) => {
            if (newUrl.includes('.csv')) {
                window.location.href = '/';
            }
        });
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`, {
            timeout: 60000,
        });

        cy.findByTestId('page-spinner').should('not.exist');
    });

    it('Should download CSV from results on Explore', () => {
        const downloadUrl = `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/*/download`;
        cy.intercept({
            method: 'POST',
            url: downloadUrl,
        }).as('apiDownload');
        // choose table and select fields
        cy.findByText('Orders').click();
        cy.findByText('Order date').should('be.visible'); // Wait for Orders table columns to appear
        cy.findByText('Customers').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();

        // run query
        cy.get('button').contains('Run query').click();

        // wait for the chart to finish loading
        cy.findByText('Loading chart').should('not.exist');
        cy.findByText('Loading results').should('not.exist');
        cy.get('body').then(($body) => {
            if ($body.find('[data-testid=export-csv-button]').length > 1) {
                // close chart section
                cy.findByTestId('Chart-card-expand').click();
            }
        });
        // Export results
        cy.get('[data-testid=export-csv-button]').click();
        cy.get('[data-testid=chart-export-results-button]').click();

        cy.wait('@apiDownload', { timeout: 3000 }).then((interception) => {
            expect(interception?.response?.statusCode).to.eq(200);
            expect(interception?.response?.body.results).to.have.property(
                'fileUrl',
            );
        });
    });
    it('Should download CSV from table chart on Explore', () => {
        const downloadUrl = `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/*/download`;
        cy.intercept({
            method: 'POST',
            url: downloadUrl,
        }).as('apiDownload');

        cy.findByTestId('page-spinner').should('not.exist');

        // choose table and select fields
        cy.get('[data-testid="common-sidebar"]').within(() => {
            cy.findByText('Orders').click();
        });
        cy.findByText('Order date').should('be.visible'); // Wait for Orders table columns to appear
        cy.get('[data-testid="common-sidebar"]').within(() => {
            cy.findByText('Customers').click();
            cy.findByText('First name').click();
            cy.findByText('Unique order count').click();
        });

        // run query
        cy.get('button').contains('Run query').click();

        // wait for chart to be expanded and configure button to be available, then change chart type to Table
        cy.get('body').then(($body) => {
            if ($body.find(':contains("Configure")').length === 0) {
                // open chart section if closed
                cy.get('[data-testid=Chart-card-expand]').click();
            }
        });
        cy.findByText('Configure').click();
        cy.get('button').contains('Bar chart').click();
        cy.get('[role="menuitem"]').contains('Table').click();
        cy.get('[data-testid=export-csv-button]').first().click();
        cy.get('[data-testid=chart-export-results-button]').click();

        cy.wait('@apiDownload').then((interception) => {
            expect(interception?.response?.statusCode).to.eq(200);

            expect(interception?.response?.body.results).to.have.property(
                'fileUrl',
            );
        });
    });
});
