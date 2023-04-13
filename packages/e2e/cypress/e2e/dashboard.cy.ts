import { SEED_PROJECT } from '@lightdash/common';

describe('Dashboard', () => {
    beforeEach(() => {
        cy.login();
    });

    it('Should see dashboard', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        // wiat for the dashboard to load
        cy.findByText('Loading dashboards').should('not.exist');

        cy.contains('a', 'Jaffle dashboard').click();

        cy.findByText("What's our total revenue to date?");
        cy.findByText("What's the average spend per customer?");

        cy.findAllByText('Loading chart').should('have.length', 0); // Finish loading

        cy.findAllByText('No chart available').should('have.length', 0);
        cy.findAllByText('No data available').should('have.length', 0);

        cy.get('.echarts-for-react').should('have.length', 3); // Charts
        cy.contains('Payments total revenue'); // BigNumber chart
        cy.get('thead th').should('have.length', 6); // Table chart
    });

    it('Should use dashboard filters', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        // wiat for the dashboard to load
        cy.findByText('Loading dashboards').should('not.exist');

        cy.contains('a', 'Jaffle dashboard').click();

        cy.contains('How much revenue');

        cy.findAllByText('Loading chart').should('have.length', 0); // Finish loading

        cy.contains('bank_transfer').should('have.length', 1);

        // Add filter
        cy.contains('Add filter').click();

        cy.findByPlaceholderText('Search field...')
            .click()
            .type('payment method{enter}');
        cy.findByPlaceholderText('Start typing to filter results').type(
            'credit_card{enter}{esc}',
        );
        cy.contains('Apply').click();

        cy.contains('bank_transfer').should('have.length', 0);
    });

    it('Should create dashboard with tiles', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        cy.contains('Create dashboard').click();
        cy.findByLabelText('Name your dashboard').type('Title');
        cy.findByLabelText('Dashboard description').type('Description');
        cy.findByText('Create').click();

        cy.findAllByText('Add tile').click({ multiple: true });
        cy.findByText('Saved chart').click();
        cy.findByRole('dialog').findByPlaceholderText('Search...').click();
        cy.contains('How much revenue').click();
        cy.findByText('Add').click();

        cy.findAllByText('Add tile').click({ multiple: true });
        cy.findByText('Markdown').click();
        cy.findByLabelText('Title').type('Title');
        cy.get('textarea').type('Content');
        cy.findByText('Add').click();

        cy.findAllByText('Add tile').click({ multiple: true });
        cy.findByText('Loom video').click();

        cy.findByLabelText('Title *').type('Title');
        cy.findByLabelText('Loom url *').type(
            'https://www.loom.com/share/12345',
        );
        cy.findByText('Add').click();

        cy.findByText('Save').click();

        cy.contains('Dashboard was updated');

        cy.findAllByText('Loading chart').should('have.length', 0); // Finish loading
        cy.findAllByText('No chart available').should('have.length', 0);
        cy.findAllByText('No data available').should('have.length', 0);
    });
});
