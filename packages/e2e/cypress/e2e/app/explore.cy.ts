import { SEED_PROJECT } from '@lightdash/common';

describe('Explore', () => {
    beforeEach(() => {
        cy.login();
    });

    it('Should query orders', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        cy.findByTestId('page-spinner').should('not.exist');

        cy.findByText('Orders').click();
        cy.findByText('Customers').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();

        // run query
        cy.get('button').contains('Run query').click();

        // wait for query to finish
        cy.findByText('Loading chart').should('not.exist');
        cy.findByText('Loading results').should('not.exist');

        // open column menu
        cy.get('th')
            .contains('Customers First name')
            .closest('th')
            .find('button')
            .click();

        // sort `Customers First-Name` by ascending
        cy.findByRole('menuitem', { name: 'Sort A-Z' }).click();

        // wait for query to finish
        cy.findByText('Loading results').should('not.exist');

        // check that first row in first column is 'Adam'
        cy.get('table')
            .find('td', { timeout: 10000 })
            .eq(1)
            .should('contain.text', 'Adam');
    });

    it('Should save chart', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        cy.findByTestId('page-spinner').should('not.exist');

        cy.findByText('Orders').click();
        cy.findByText('Customers').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();

        cy.findByTestId('Charts-card-expand').click();

        cy.findByText('Save chart').click();
        cy.findByTestId('ChartCreateModal/NameInput').type('My chart');
        cy.findByText('Save').click();
        cy.findByText('Success! Chart was saved.');

        // FIXME disabling save changes button is currently broken...
        // cy.findByText('Save changes').parent().should('be.disabled');

        // wait for the chart to finish loading
        cy.findByText('Loading chart').should('not.exist');

        cy.findByText('Edit chart').parent().click();
        cy.findByText('Configure').click();
        cy.findByText('Bar chart').click(); // Change chart type
        cy.findByText('Horizontal bar chart').click();

        // cy.findByText('Save changes').parent().should('not.be.disabled');
        cy.findByText('Save changes').parent().click();

        cy.findByText('Success! Chart was updated.');
    });

    it('Should change chart config type', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByTestId('page-spinner').should('not.exist');

        // choose table and select fields
        cy.findByText('Orders').click();
        cy.findByText('Customers').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();

        // check that selected fields are in the table headers
        cy.get('th').contains('Customers First name').should('exist');
        cy.get('th').contains('Orders Unique order count').should('exist');

        // run query
        cy.get('button').contains('Run query').click();

        // open chart

        // wait for the chart to finish loading
        cy.contains('Loading chart').should('not.exist');

        // open chart menu and change chart types
        cy.findByText('Configure').click();
        cy.get('button').contains('Bar chart').click();

        cy.get('[role="menuitem"]').contains('Bar chart').click();
        cy.get('button').contains('Bar chart').click();

        cy.get('[role="menuitem"]').contains('Horizontal bar chart').click();
        cy.get('button').contains('Horizontal bar chart').click();

        cy.get('[role="menuitem"]').contains('Line chart').click();
        cy.get('button').contains('Line chart').click();

        cy.get('[role="menuitem"]').contains('Area chart').click();
        cy.get('button').contains('Area chart').click();

        cy.get('[role="menuitem"]').contains('Scatter chart').click();
        cy.get('button').contains('Scatter chart').click();

        cy.get('[role="menuitem"]').contains('Table').click();
        // Use a different selector cause there is another button with 'Table'
        cy.get('[data-testid="VisualizationCardOptions"]').click();

        cy.get('[role="menuitem"]').contains('Big value').click();
        cy.get('button').contains('Big value');
    });

    it('Should change chart config layout', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        cy.findByTestId('page-spinner').should('not.exist');

        cy.findByText('Orders').click();
        cy.findByText('Customers').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();

        // run query
        cy.get('button').contains('Run query').click();

        cy.get('g').children('text').should('have.length.lessThan', 30); // without labels

        cy.findByText('Configure').click();
        cy.findByText('Series').click();
        cy.findByText('Value labels')
            .parent()
            .find('[role="combobox"]')
            .click();
        cy.get('.mantine-Select-item').contains('Top').click();

        cy.get('g').children('text').should('have.length.greaterThan', 30); // with labels
    });

    describe('Sort', () => {
        it('should sort multisort results', () => {
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

            cy.findByText('Orders').click();
            cy.findByText('Customers').click();
            cy.findByText('First name').click();
            cy.findByText('Unique order count').click();

            // run query
            cy.get('button').contains('Run query').click();

            // wait for query to finish
            cy.findByText('Loading results').should('not.exist');

            // open column menu
            cy.get('th')
                .contains('Orders Unique order count')
                .closest('th')
                .find('button')
                .click();
            // sort `Orders Unique order count` by ascending
            cy.findByRole('menuitem', { name: 'Sort 1-9' }).click();

            cy.get('span').contains('Sorted by 1 field').should('exist');

            cy.get('th')
                .contains('Customers First name')
                .closest('th')
                .find('button')
                .click();
            // sort `Customers First name` by ascending
            cy.findByRole('menuitem', { name: 'Sort Z-A' }).click();

            cy.get('span').contains('Sorted by 2 fields').should('exist');

            // wait for query to finish
            cy.findByText('Loading results').should('not.exist');
        });
    });

    describe('Chart type', () => {
        describe('Table', () => {
            describe('Config', () => {
                it('should hide table names from the header according to the config', () => {
                    cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

                    // choose table and select fields
                    cy.findByText('Orders').click();
                    cy.findByText('Customers').click();
                    cy.findByText('First name').click();
                    cy.findByText('Unique order count').click();

                    // run query
                    cy.get('button').contains('Run query').click();

                    // wait for the chart to finish loading
                    cy.findByText('Loading chart').should('not.exist');

                    // open chart menu and change chart type to Table
                    cy.get('button').contains('Configure').click();
                    cy.get('[data-testid="VisualizationCardOptions"]').click();
                    cy.get('[role="menuitem"]').contains('Table').click();

                    // check that chart table headers are correct
                    cy.findByTestId('visualization')
                        .find('th')
                        .contains('Customers First name')
                        .should('exist');

                    cy.findByLabelText('Show table names').click({
                        force: true,
                    });

                    // check that chart table headers are correct
                    cy.findByTestId('visualization')
                        .find('th')
                        .contains('Customers First name')
                        .should('not.exist');
                    cy.findByTestId('visualization')
                        .find('th')
                        .contains('First name')
                        .should('exist');
                });

                it('should show header overrides according to the config', () => {
                    cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

                    // choose table and select fields
                    cy.findByText('Orders').click();
                    cy.findByText('Customers').click();
                    cy.findByText('First name').click();
                    cy.findByText('Unique order count').click();

                    // run query
                    cy.get('button').contains('Run query').click();

                    // wait for the chart to finish loading
                    cy.findByText('Loading chart').should('not.exist');

                    // open chart menu and change chart type to Table
                    cy.get('button').contains('Configure').click();
                    cy.get('[data-testid="VisualizationCardOptions"]').click();
                    cy.get('[role="menuitem"]').contains('Table').click();

                    // check that chart table headers are correct
                    cy.findByTestId('visualization')
                        .find('th')
                        .eq(1)
                        .contains('Customers First name')
                        .should('exist');

                    // open configuration and flip Show table names in the config
                    cy.findByPlaceholderText('Customers First name')
                        .focus()
                        .type('Overridden header')
                        .blur();

                    // check that chart table headers are overridden
                    cy.findByTestId('visualization')
                        .find('th')
                        .eq(1)
                        .contains('Overridden header')
                        .should('exist');
                });
            });
        });
    });

    it('Should open SQL Runner with current query', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Orders').click();
        cy.findByText('Is completed').click();

        // open SQL
        cy.findByTestId('SQL-card-expand').click();

        // wait to compile query
        cy.findByText('Open in SQL Runner').parent().should('not.be.disabled');

        let sqlQueryFromExploreLines;
        const sqlQueryFromSqlRunnerLines: string[] = [];

        // Get compiled SQL query from Explore
        cy.get('.mantine-Prism-root')
            .within(() => {
                sqlQueryFromExploreLines = Cypress.$(
                    '.mantine-Prism-lineContent',
                )
                    .toArray()
                    .map((el) => (el.innerText === '\n' ? '' : el.innerText));
            })
            .then(() => {
                // open SQL Runner
                cy.findByText('Open in SQL Runner').parent().click();
                // wait for URL to change to be in SQL Runner
                cy.url().should('include', '/sqlRunner');
                cy.get('.ace_content').should('exist');

                // Get SQL query from SQL Runner editor
                cy.get('.ace_line')
                    .each(($el) => {
                        sqlQueryFromSqlRunnerLines.push($el.text());
                    })
                    .then(() => {
                        // compare SQL query from the Explore with the one in SQL Runner
                        cy.get('.ace_line').should(
                            'have.length',
                            sqlQueryFromExploreLines?.length,
                        );
                        cy.wrap(sqlQueryFromSqlRunnerLines).should(
                            'deep.equal',
                            sqlQueryFromExploreLines,
                        );
                    });
            });
    });

    it('Should clear query using hotkeys', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Orders').click();
        cy.findByText('Is completed').click();

        // run query
        cy.get('button').contains('Run query').click();

        // wait for query to finish
        cy.findByText('Loading results').should('not.exist');

        // clear query hotkeys
        cy.get('body').type('{ctrl}{alt}{k}');

        // verify empty query keeping selected table
        cy.findByText('Tables', { selector: 'a' })
            .parent()
            .should('have.text', 'Tables/Orders');
        cy.findByText('Pick a metric & select its dimensions').should('exist');
    });
});
