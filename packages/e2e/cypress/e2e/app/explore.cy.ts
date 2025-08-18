import { SEED_PROJECT } from '@lightdash/common';

describe('Explore', () => {
    beforeEach(() => {
        cy.login();
    });

    it('Should query orders', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        cy.findByTestId('page-spinner').should('not.exist');

        cy.findByText('Orders').click();
        cy.findByText('Dimensions').should('exist');
        cy.findByText('Customers').click();

        // ! Tests run with auto-fetch enabled, so a query runs after each change in the explorer (e.g. clicking a field)
        // ! This means that right after clicking a field the default sort is applied
        // ! Since we check attempt to set the order to "First name" we need to click on a different field first, otherwise the sort for first name is applied and the test fails
        cy.findByText('Unique order count').click();
        cy.findByText('First name').click();

        // open column menu
        cy.get('th')
            .contains('Customers First name')
            .closest('th')
            .find('button')
            .click();

        // sort `Customers First-Name` by ascending
        cy.findByRole('menuitem', { name: 'Sort A-Z' }).click();

        // run query
        cy.get('button').contains('Run query').click();

        // wait for query to finish
        cy.findByText('Loading results').should('not.exist');

        // check that first row in first column is 'Aaron'
        cy.get('table')
            .find('td', { timeout: 10000 })
            .eq(1)
            .should('contain.text', 'Aaron');
    });

    it('Should save chart', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        cy.findByTestId('page-spinner').should('not.exist');

        cy.findByText('Orders').click();
        cy.findByText('Dimensions');
        cy.findByText('Customers').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();

        cy.findByTestId('Chart-card-expand').click();

        cy.findByText('Save chart').click();

        cy.findByTestId('ChartCreateModal/NameInput').type('My chart');
        cy.contains('Next').click();
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
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);

        cy.findByTestId('page-spinner').should('not.exist');

        // choose table and select fields
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
        cy.wait(500); // wait for the select to fully update - this tries to ensure that state has finished mutating
        cy.get('button').contains('Bar chart').click();

        cy.get('[role="menuitem"]').contains('Bar chart').click();
        cy.wait(500); // wait for the select to fully update - this tries to ensure that state has finished mutating
        cy.get('button').contains('Bar chart').click();

        cy.get('[role="menuitem"]').contains('Horizontal bar chart').click();
        cy.wait(500); // wait for the select to fully update - this tries to ensure that state has finished mutating
        cy.get('button').contains('Horizontal bar chart').click();

        cy.get('[role="menuitem"]').contains('Line chart').click();
        cy.wait(500); // wait for the select to fully update - this tries to ensure that state has finished mutating
        cy.get('button').contains('Line chart').click();

        cy.get('[role="menuitem"]').contains('Area chart').click();
        cy.wait(500); // wait for the select to fully update - this tries to ensure that state has finished mutating
        cy.get('button').contains('Area chart').click();

        cy.get('[role="menuitem"]').contains('Scatter chart').click();
        cy.wait(500); // wait for the select to fully update - this tries to ensure that state has finished mutating
        cy.get('button').contains('Scatter chart').click();

        cy.get('[role="menuitem"]').contains('Pie chart').click();
        cy.wait(500); // wait for the select to fully update - this tries to ensure that state has finished mutating
        cy.get('button').contains('Pie chart').click();

        cy.get('[role="menuitem"]').contains('Table').click();
        // Use a different selector cause there is another button with 'Table'
        cy.get('[data-testid="VisualizationCardOptions"]').click();

        cy.get('[role="menuitem"]').contains('Big value').click();
        cy.get('button').contains('Big value');
    });

    it('Keeps chart config after updating table calculation', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);

        cy.findByTestId('page-spinner').should('not.exist');

        // choose table and select fields
        cy.findByText('Customers').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();

        // add table calculation
        cy.get('button').contains('Table calculation').click();
        cy.findByTestId('table-calculation-name-input').type('TC');
        // eslint-disable-next-line no-template-curly-in-string
        cy.get('div.ace_content').type('${{}orders.unique_order_count{}}'); // cypress way of escaping { and }
        cy.findAllByTestId('table-calculation-save-button').click();

        // run query
        cy.get('button').contains('Run query').click();

        // wait for the chart to finish loading
        cy.contains('Loading chart').should('not.exist');

        // open chart menu and change chart types
        cy.findByText('Configure').click();

        // change X-axis to table calculation
        cy.findByTestId('x-axis-field-select').click();
        cy.findByTestId('x-axis-field-select').clear();
        cy.findByTestId('x-axis-field-select').type('TC');
        cy.findByTestId('x-axis-field-select').type('{downArrow}{enter}');

        // change y-axis to table calculation
        cy.findByTestId('y-axis-field-select').click();
        cy.findByTestId('y-axis-field-select').clear();
        cy.findByTestId('y-axis-field-select').type('TC');
        cy.findByTestId('y-axis-field-select').type('{downArrow}{enter}');

        cy.get('th').contains('TC').closest('th').find('button').click();

        const newTCName = 'TC2';

        cy.get('button').contains('Edit calculation').click();
        cy.findByTestId('table-calculation-name-input').type(
            `{selectAll}${newTCName}`,
        );
        cy.findAllByTestId('table-calculation-save-button').click();

        // run query
        cy.get('button').contains('Run query').click();

        // wait for the chart to finish loading
        cy.contains('Loading chart').should('not.exist');

        cy.findByTestId('x-axis-field-select').should('have.value', newTCName);
        cy.findByTestId('y-axis-field-select').should('have.value', newTCName);
    });

    it('Should change chart config layout', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        cy.findByTestId('page-spinner').should('not.exist');

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
            cy.findByText('Dimensions');
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

            cy.get('.mantine-Badge-inner')
                .contains('Sorted by')
                .parent()
                .contains('Unique order count')
                .should('exist');

            cy.get('th')
                .contains('Customers First name')
                .closest('th')
                .find('button')
                .click();
            // sort `Customers First name` by ascending
            cy.findByRole('menuitem', { name: 'Sort Z-A' }).click();

            cy.get('.mantine-Badge-inner')
                .contains('Sorted by')
                .parent()
                .contains('First name')
                .should('exist');

            // wait for query to finish
            cy.findByText('Loading results').should('not.exist');

            // Add multi sort via popover
            cy.get('.mantine-Badge-inner')
                .contains('Sorted by')
                .parent()
                .click();
            cy.get('button').contains('Add sort').click();
            cy.findByPlaceholderText('Add sort field').click();

            // click on Unique order count to add it to the sort
            cy.get('.mantine-Select-item')
                .contains('Unique order count')
                .click();

            // Multiple sort should be visible in badge
            cy.get('.mantine-Badge-inner')
                .contains('Sorted by')
                .parent()
                .contains('2 fields')
                .should('exist');

            // wait for query to finish
            cy.findByText('Loading results').should('not.exist');
        });
    });

    describe('Chart type', () => {
        describe('Table', () => {
            describe('Config', () => {
                it('should hide table names from the header according to the config', () => {
                    cy.visit(
                        `/projects/${SEED_PROJECT.project_uuid}/tables/orders`,
                    );

                    // choose table and select fields
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
                    cy.visit(
                        `/projects/${SEED_PROJECT.project_uuid}/tables/orders`,
                    );

                    // choose table and select fields
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

        // Get compiled SQL query from Explore
        cy.getMonacoEditorText().then((exploreSql) => {
            // open SQL Runner and wait for route change
            cy.findByText('Open in SQL Runner').parent().click();
            cy.url().should('include', '/sql-runner');
            // Get compiled SQL query from SQL runner
            cy.getMonacoEditorText().then((runnerSql) => {
                // They should match
                expect(exploreSql).to.equal(runnerSql);
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
