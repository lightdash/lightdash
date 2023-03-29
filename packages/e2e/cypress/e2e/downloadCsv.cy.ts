import { SEED_PROJECT } from '@lightdash/common';

describe('Download CSV on SQL Runner', () => {
    beforeEach(() => {
        cy.login();
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/sqlRunner`);
    });

    it('Should download CSV from table chart on SQL runner', () => {
        const downloadUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}/sqlRunner/downloadCsv`;
        cy.intercept({
            method: 'POST',
            url: downloadUrl,
        }).as('apiDownloadCsv');

        cy.findByText('payments').click();
        cy.findAllByText('Run query').first().click();

        const find = ['Payment method', 'bank_transfer', 'credit_card'];
        find.forEach((text) => cy.findAllByText(text));
        cy.contains('Page 1 of 3');

        cy.findByText('Charts').parent().findByRole('button').click();
        cy.findByText('Bar chart').click(); // Change chart type
        cy.findByText('Table').click();

        cy.findByText('Export CSV').click();

        cy.wait('@apiDownloadCsv').then((interception) => {
            expect(interception?.response?.statusCode).to.eq(200);
            expect(interception?.response?.body.results).to.have.property(
                'url',
            );
        });
    });
});

describe('Download CSV on Dashboards', () => {
    beforeEach(() => {
        cy.login();
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);
    });

    it('Should download a CSV from dashboard', () => {
        const downloadUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}/explores/payments/downloadCsv`;
        cy.intercept({
            method: 'POST',
            url: downloadUrl,
        }).as('apiDownloadCsv');

        // wiat for the dashboard to load
        cy.findByText('Loading dashboards').should('not.exist');

        cy.contains('a', 'Jaffle dashboard').click();

        cy.findAllByText('Loading chart').should('have.length', 0); // Finish loading

        cy.findAllByText('No chart available').should('have.length', 0);
        cy.findAllByText('No data available').should('have.length', 0);

        cy.get('thead th').should('have.length', 6); // Table chart
        cy.contains('Days since').trigger('mouseenter');

        cy.get('[data-icon="more"]').eq(1).click();
        cy.findByText('Export CSV').click();
        cy.get('button').contains('Export CSV').click();

        cy.wait('@apiDownloadCsv').then((interception) => {
            expect(interception?.response?.statusCode).to.eq(200);
            expect(interception?.response?.body.results).to.have.property(
                'url',
            );
        });
    });
});

describe('Download CSV on Explore', () => {
    beforeEach(() => {
        cy.login();
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);
    });

    it('Should download CSV from results on Explore', () => {
        const downloadUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}/explores/orders/downloadCsv`;
        cy.intercept({
            method: 'POST',
            url: downloadUrl,
        }).as('apiDownloadCsv');

        // choose table and select fields
        cy.findByText('Orders').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();

        // run query
        cy.get('button').contains('Run query').click();

        // wait for the chart to finish loading
        cy.findByText('Loading chart').should('not.exist');

        cy.findByText('Export CSV').click();
        cy.get('[data-icon="export"]').click();

        cy.wait('@apiDownloadCsv').then((interception) => {
            expect(interception?.response?.statusCode).to.eq(200);
            expect(interception?.response?.body.results).to.have.property(
                'url',
            );
        });
    });
    it('Should download CSV from table chart on Explore', () => {
        const downloadUrl = `/api/v1/projects/${SEED_PROJECT.project_uuid}/explores/orders/downloadCsv`;
        cy.intercept({
            method: 'POST',
            url: downloadUrl,
        }).as('apiDownloadCsv');
        // choose table and select fields
        cy.findByText('Orders').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();

        // run query
        cy.get('button').contains('Run query').click();

        // open chart
        cy.findByText('Charts').parent().findByRole('button').click();
        // Close results
        cy.findByText('Results').parent().findByRole('button').click();
        // wait for the chart to finish loading
        cy.findByText('Loading chart').should('not.exist');

        // open chart menu and change chart type to Table
        cy.get('button').contains('Bar chart').click();
        cy.get('[role="menuitem"]').contains('Table').click();

        cy.findByText('Export CSV').click();
        cy.get('[data-icon="export"]').click();

        cy.wait('@apiDownloadCsv').then((interception) => {
            expect(interception?.response?.statusCode).to.eq(200);
            expect(interception?.response?.body.results).to.have.property(
                'url',
            );
        });
    });
});
