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

    it('Should use dashboard filters, should clear them for new dashboards', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        // wait for the dashboard to load
        cy.findByText('Loading dashboards').should('not.exist');

        cy.contains('a', 'Jaffle dashboard').click();

        cy.get('.react-grid-layout').within(() => {
            cy.contains('How much revenue');
        });

        cy.findAllByText('Loading chart').should('have.length', 0); // Finish loading

        cy.contains('bank_transfer').should('have.length', 1);

        // Add filter
        cy.contains('Add filter').click();

        cy.findByTestId('FilterConfiguration/FieldSelect')
            .click()
            .type('payment method{downArrow}{enter}');
        cy.findByPlaceholderText('Start typing to filter results').type(
            'credit_card',
        );
        cy.findByRole('option', { name: 'credit_card' }).click();
        cy.findAllByRole('tab').eq(0).click();
        cy.contains('button', 'Apply').click({ force: true });

        cy.contains('bank_transfer').should('have.length', 0);

        // Check url includes no saved filters
        cy.url().should('not.include', 'filters=');
        cy.url().should('not.include', 'years');

        // Check url includes temp filters
        cy.url().should('include', 'tempFilters=');
        cy.url().should('include', 'credit_card');

        // Check that temp filter gets kept on reload
        cy.reload();
        cy.contains('Payment method is credit_card');
        cy.contains('bank_transfer').should('have.length', 0);

        // Create a new dashboard
        cy.get('[data-testid="ExploreMenu/NewButton"]').click();
        cy.get('[data-testid="ExploreMenu/NewDashboardButton"]').click();

        cy.findByLabelText('Name your dashboard *').type('Title');
        cy.findByText('Create').click();

        // Check url has no filters
        cy.url().should('not.include', 'filters=');
        cy.url().should('not.include', 'tempFilters=');
        cy.url().should('not.include', '?');
    });

    it('Should create dashboard with saved chart + charts within dashboard + filters + tile targets', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);

        cy.contains('Create dashboard').click();
        cy.findByLabelText('Name your dashboard *').type('Title');
        cy.findByLabelText('Dashboard description').type('Description');
        cy.findByText('Create').click();

        // Add Saved Chart
        cy.findAllByText('Add tile').click({ multiple: true });
        cy.findByText('Saved chart').click();
        cy.findByRole('dialog').findByPlaceholderText('Search...').click();
        cy.contains('How much revenue').click();
        cy.findByRole('dialog').get('.mantine-MultiSelect-input').click(); // Close dropdown
        cy.findByText('Add').click();

        // Create chart within dashboard
        cy.findAllByText('Add tile').click({ multiple: true });
        cy.findByText('New chart').click();
        cy.findByText('You are creating this chart from within "Title"').should(
            'exist',
        );
        cy.findByText('Payments').click();
        cy.findByText('Payment method').click();
        cy.findByText('Unique payment count').click();
        cy.findByText('Save chart').click();
        cy.findByTestId('ChartCreateModal/NameInput').type(
            `What's the number of unique payments per payment method?`,
        );
        cy.findByText('Save').click();
        cy.findByText(
            `Success! What's the number of unique payments per payment method? was added to Title`,
        ).should('exist');

        // Wait to be redirected to dashboard
        cy.url().should('include', '/dashboards');

        // Add filter Payment method is credit_card and apply
        cy.contains('Add filter').click();
        cy.findByTestId('FilterConfiguration/FieldSelect')
            .click()
            .type('payment method{downArrow}{enter}');
        // using force click here because this is a mantine switch and the actual checkbox is hidden
        cy.findByLabelText('Provide default value').click({ force: true });
        cy.findByPlaceholderText('Start typing to filter results').type(
            'credit_card',
        );
        cy.findByRole('option', { name: 'credit_card' }).click();
        cy.contains('button', 'Apply').click({ force: true });

        // Filter should be applied and no other payment methods should be visible in the charts
        cy.contains('bank_transfer').should('have.length', 0);

        // Create another chart within dashboard
        cy.findAllByText('Add tile').click({ multiple: true });
        cy.findByText('New chart').click();
        cy.findByText('You are creating this chart from within "Title"').should(
            'exist',
        );
        cy.findByText('Payments').click();
        cy.findByText('Payment method').click();
        cy.findByText('Total revenue').click();
        cy.findByText('Save chart').click();
        cy.findByTestId('ChartCreateModal/NameInput').type(
            `What's the total revenue per payment method?`,
        );
        cy.findByText('Save').click();
        cy.findByText(
            `Success! What's the total revenue per payment method? was added to Title`,
        ).should('exist');

        // Wait to be redirected to dashboard
        cy.url().should('include', '/dashboards');

        // Filter payment method should be already applied
        cy.contains('bank_transfer').should('have.length', 0);

        // Check tile targets are correct and all charts have that filter applied
        cy.contains('Payment method is credit_card').click();
        cy.findAllByRole('tab').eq(1).click();
        cy.get('.mantine-Checkbox-body').should('have.length', 4); // 3 checkboxes for the 3 charts + `select all` checkbox
        cy.get('.mantine-Checkbox-body').each(($el) => {
            cy.wrap($el).find('input[checked]').should('have.length', 1);
        });

        // Remove filter from first chart - saved chart
        cy.get('.mantine-Checkbox-body').eq(1).click();
        cy.contains('button', 'Apply').click({ force: true });

        // Saved chart should have no filter applied
        cy.get('.react-grid-item').first().should('contain', 'bank_transfer');
        cy.contains('bank_transfer').should('have.length', 1);

        // Create new chart within dashboard, but reference another explore
        cy.findAllByText('Add tile').click({ multiple: true });
        cy.findByText('New chart').click();
        cy.findByText('You are creating this chart from within "Title"').should(
            'exist',
        );
        cy.findByText('staging').click();
        cy.findByText('Stg payments').click();
        cy.findByText('Payment method').click();
        cy.findByText('Amount').click();
        cy.findByText('Save chart').click();
        cy.findByTestId('ChartCreateModal/NameInput').type(
            `Stg Payments (payment method x amount)?`,
        );
        cy.findByText('Save').click();
        cy.findByText(
            `Success! Stg Payments (payment method x amount)? was added to Title`,
        ).should('exist');

        // Wait to be redirected to dashboard
        cy.url().should('include', '/dashboards');

        // Open filter popover  and check that all charts have the filter applied except for the new one (which is referencing another explore)
        cy.contains('Payment method is credit_card').click();
        cy.findAllByRole('tab').eq(1).click();
        cy.get('.mantine-Checkbox-body').should('have.length', 5); // 4 checkboxes for the 4 charts + `select all` checkbox

        // Enable filter for the new chart
        cy.get('.mantine-Checkbox-body').eq(4).click();
        cy.get('.mantine-Checkbox-body')
            .eq(4)
            .within(() => {
                cy.get('input').should('be.checked');
            });
        cy.get('.mantine-Checkbox-body')
            .eq(4)
            .parent()
            .parent()
            .siblings()
            .first()
            .within(() => {
                cy.get('input.mantine-Input-input').should(
                    'have.value',
                    'Stg payments Payment method',
                );
            });
        cy.contains('button', 'Apply').click({ force: true });

        // Saved chart should have the filter applied and only see credit_card bar
        cy.get('.react-grid-item')
            .last()
            .should('not.contain', 'bank_transfer');

        // Add Markdown tile
        cy.findAllByText('Add tile').click();
        cy.findByText('Markdown').click();
        cy.findByLabelText('Title').type('Title');
        cy.get('.mantine-Modal-body').find('textarea').type('Content');
        cy.findByText('Add').click();

        cy.findByText('Save changes').click();

        cy.contains('Dashboard was updated');

        cy.findAllByText('Loading chart').should('have.length', 0); // Finish loading
        cy.findAllByText('No chart available').should('have.length', 0);
        cy.findAllByText('No data available').should('have.length', 0);
    });
});
