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

        cy.get('.react-grid-layout').within(() => {
            cy.findByText("What's our total revenue to date?");
            cy.findByText("What's the average spend per customer?");
        });

        cy.findAllByText('Loading chart').should('have.length', 0); // Finish loading

        cy.findAllByText('No chart available').should('have.length', 0);
        cy.findAllByText('No data available').should('have.length', 0);

        cy.get('.echarts-for-react').should('have.length', 3); // Charts

        cy.get('.react-grid-layout').within(() => {
            cy.contains('Payments total revenue'); // BigNumber chart
            cy.get('thead th').should('have.length', 6); // Table chart
        });
    });

    it('Should use dashboard filters', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        // wiat for the dashboard to load
        cy.findByText('Loading dashboards').should('not.exist');

        cy.contains('a', 'Jaffle dashboard').click();

        cy.get('.react-grid-layout').within(() => {
            cy.contains('How much revenue');
        });

        cy.findAllByText('Loading chart').should('have.length', 0); // Finish loading

        cy.contains('bank_transfer').should('have.length', 1);

        // Add filter
        cy.contains('Add filter').click();

        cy.get('#field-autocomplete').click().type('payment method{enter}');
        cy.findByPlaceholderText('Start typing to filter results').type(
            'credit_card{enter}',
        );
        cy.findAllByRole('tab').eq(0).click();
        cy.contains('button', 'Apply').click();

        cy.contains('bank_transfer').should('have.length', 0);
    });

    it('Should create dashboard with tiles', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        cy.contains('Create dashboard').click();
        cy.findByLabelText('Name your dashboard *').type('Title');
        cy.findByLabelText('Dashboard description').type('Description');
        cy.findByText('Create').click();

        cy.findAllByText('Add tile').click({ multiple: true });
        cy.findByText('Saved chart').click();
        cy.findByRole('dialog').findByPlaceholderText('Search...').click();
        cy.contains('How much revenue').click();
        cy.findByRole('dialog').get('.mantine-MultiSelect-input').click(); // Close dropdown
        cy.findByText('Add').click();

        cy.findAllByText('Add tile').click({ multiple: true });
        cy.findByText('New chart').click();
        cy.findByText('You are creating this chart from within "Title"').should(
            'exist',
        );
        cy.findByText('Orders').click();
        cy.findByText('Status').click();
        cy.findByText('Average order size').click();
        cy.findByText('Save chart').click();
        cy.get('input#chart-name').type('Average order size per status');
        cy.findByText('Save').click();
        cy.findByText(
            'Success! Average order size per status was added to Title',
        ).should('exist');

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
