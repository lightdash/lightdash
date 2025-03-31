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

    it(
        'Should download a CSV from dashboard',
        { retries: 3, pageLoadTimeout: 1000 },
        () => {
            const downloadUrl = `/api/v1/saved/*/downloadCsv`;
            cy.intercept({
                method: 'POST',
                url: downloadUrl,
            }).as('apiDownloadCsv');

            // wait for the dashboard to load
            cy.findByText('Loading dashboards').should('not.exist');

            cy.contains('a', 'Jaffle dashboard').click();

            cy.findByTestId('page-spinner').should('not.exist');

            cy.findAllByText('No chart available').should('have.length', 0);
            cy.findAllByText('No data available').should('have.length', 0);

            cy.get('thead th').should('have.length', 6); // Table chart
            cy.contains('Days since').trigger('mouseenter');

            cy.findByTestId('tile-icon-more').click();
            cy.findByText('Export CSV').click();
            cy.get('button').contains('Export CSV').click();

            cy.wait('@apiDownloadCsv').then((interception) => {
                expect(interception?.response?.statusCode).to.eq(200);

                expect(interception?.response?.body.results).to.have.property(
                    'jobId',
                );
            });
        },
    );
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

    it(
        'Should download CSV from results on Explore',
        { retries: 3, pageLoadTimeout: 1000 },
        () => {
            const downloadUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}/explores/orders/downloadCsv`;
            cy.intercept({
                method: 'POST',
                url: downloadUrl,
            }).as('apiDownloadCsv');
            // choose table and select fields
            cy.findByText('Orders').click();
            cy.findByText('Customers').click();
            cy.findByText('First name').click();
            cy.findByText('Unique order count').click();

            // run query
            cy.get('button').contains('Run query').click();

            // wait for the chart to finish loading
            cy.findByText('Loading chart').should('not.exist');
            cy.findByText('Loading results').should('not.exist');

            cy.get('[data-testid=export-csv-button]').eq(1).click();
            cy.get('[data-testid=chart-export-csv-button]').click();

            cy.findByText('Export CSV').click();

            cy.wait('@apiDownloadCsv', { timeout: 3000 }).then(
                (interception) => {
                    expect(interception?.response?.statusCode).to.eq(200);
                    expect(
                        interception?.response?.body.results,
                    ).to.have.property('jobId');
                },
            );
        },
    );
    it(
        'Should download CSV from table chart on Explore',
        { retries: 3, pageLoadTimeout: 1000 },
        () => {
            const downloadUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}/explores/orders/downloadCsv`;
            cy.intercept({
                method: 'POST',
                url: downloadUrl,
            }).as('apiDownloadCsv');

            cy.findByTestId('page-spinner').should('not.exist');

            // choose table and select fields
            cy.findByText('Orders').click();
            cy.findByText('Customers').click();
            cy.findByText('First name').click();
            cy.findByText('Unique order count').click();

            // run query
            cy.get('button').contains('Run query').click();

            // open chart
            cy.findByTestId('Chart-card-expand').click();
            // Close results
            cy.get('[data-testid=Results-card-expand]').click();

            // open chart menu and change chart type to Table
            cy.get('[data-testid=Chart-card-expand]').click();
            cy.findByText('Configure').click();
            cy.get('button').contains('Bar chart').click();
            cy.get('[role="menuitem"]').contains('Table').click();

            // find by role and text
            cy.get('[data-testid=export-csv-button]').click();
            cy.get('[data-testid=chart-export-csv-button]').click();

            cy.wait('@apiDownloadCsv').then((interception) => {
                expect(interception?.response?.statusCode).to.eq(200);

                expect(interception?.response?.body.results).to.have.property(
                    'jobId',
                );
            });
        },
    );
});
