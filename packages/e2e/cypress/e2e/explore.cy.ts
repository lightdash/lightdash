import { SEED_PROJECT } from '@lightdash/common';

describe('Explore', () => {
    before(() => {
        cy.login();
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });

    it('Should query orders', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Orders').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();
    });

    it('Should save chart', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Orders').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();

        cy.findByText('Charts').prev().click(); // open chart

        cy.findByText('Save chart').click();
        cy.get('input#chart-name').type('My chart');
        cy.findByText('Save').click();
        cy.findByText('Success! Chart was saved.');

        // FIXME disabling save changes button is currently broken...
        // cy.findByText('Save changes').parent().should('be.disabled');

        // wait for the chart to finish loading
        cy.findByText('Loading chart').should('not.exist');

        cy.findByText('Edit chart').parent().click();
        cy.findByText('Bar chart').click(); // Change chart type
        cy.findByText('Horizontal bar chart').click();

        // cy.findByText('Save changes').parent().should('not.be.disabled');
        cy.findByText('Save changes').parent().click();

        cy.findByText('Success! Chart was saved.');
    });

    it('Should change chart config type', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        // choose table and select fields
        cy.findByText('Orders').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();

        // check that selected fields are in the table headers
        cy.get('th').contains('Customers - First name').should('exist');
        cy.get('th').contains('Orders - Unique order count').should('exist');

        // run query
        cy.get('button').contains('Run query').click();

        // open chart
        cy.findByText('Charts').prev('button').click();

        // wait for the chart to finish loading
        cy.findByText('Loading chart').should('not.exist');

        // open chart menu and change chart types
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
        cy.get('button').contains('Table').click();

        cy.get('[role="menuitem"]').contains('Big value').click();
        cy.get('button').contains('Big value');
    });

    it('Should change chart config layout', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Orders').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();

        // run query
        cy.get('button').contains('Run query').click();

        cy.findByText('Charts').prev().click(); // open chart

        cy.get('g').children('text').should('have.length.lessThan', 30); // without labels

        cy.findByText('Configure').click();
        cy.findByText('Series').click();
        cy.findByText('Value labels');
        cy.get('option[value="top"]').parent().select('top');

        cy.get('g').children('text').should('have.length.greaterThan', 30); // with labels
    });

    it('Should use UTC dates', () => {
        const exploreStateUrlParams = `?create_saved_chart_version=%7B%22tableName%22%3A%22orders%22%2C%22metricQuery%22%3A%7B%22dimensions%22%3A%5B%22orders_status%22%2C%22customers_created_raw%22%5D%2C%22metrics%22%3A%5B%22orders_average_order_size%22%5D%2C%22filters%22%3A%7B%22dimensions%22%3A%7B%22id%22%3A%22927e8fc4-4a41-4972-8d15-57cb2060a1d2%22%2C%22and%22%3A%5B%7B%22id%22%3A%228cf33dc8-d62a-41fa-85c8-4078e028bd60%22%2C%22target%22%3A%7B%22fieldId%22%3A%22customers_created_raw%22%7D%2C%22operator%22%3A%22lessThan%22%2C%22values%22%3A%5B%222022-07-11T14%3A23%3A11.302Z%22%5D%7D%5D%7D%7D%2C%22sorts%22%3A%5B%7B%22fieldId%22%3A%22customers_created_raw%22%2C%22descending%22%3Atrue%7D%5D%2C%22limit%22%3A1%2C%22tableCalculations%22%3A%5B%5D%2C%22additionalMetrics%22%3A%5B%5D%7D%2C%22pivotConfig%22%3A%7B%22columns%22%3A%5B%22customers_created_raw%22%5D%7D%2C%22tableConfig%22%3A%7B%22columnOrder%22%3A%5B%22orders_status%22%2C%22customers_created_raw%22%2C%22orders_average_order_size%22%5D%7D%2C%22chartConfig%22%3A%7B%22type%22%3A%22cartesian%22%2C%22config%22%3A%7B%22layout%22%3A%7B%22xField%22%3A%22orders_status%22%2C%22yField%22%3A%5B%22orders_average_order_size%22%5D%7D%2C%22eChartsConfig%22%3A%7B%22series%22%3A%5B%7B%22type%22%3A%22bar%22%2C%22encode%22%3A%7B%22xRef%22%3A%7B%22field%22%3A%22orders_status%22%7D%2C%22yRef%22%3A%7B%22field%22%3A%22orders_average_order_size%22%2C%22pivotValues%22%3A%5B%7B%22field%22%3A%22customers_created_raw%22%2C%22value%22%3A%222017-02-11T03%3A00%3A00.000Z%22%7D%5D%7D%7D%7D%5D%2C%22legend%22%3A%7B%22show%22%3Atrue%2C%22type%22%3A%22plain%22%2C%22orient%22%3A%22horizontal%22%7D%7D%7D%7D%7D`;
        cy.visit(
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders${exploreStateUrlParams}`,
        );

        cy.findByText('Filters').prev().click();
        cy.findAllByText('Loading chart').should('have.length', 0);
        cy.findByDisplayValue('2022-07-11, 14:23:11:000');
        cy.get('svg g text').contains('2017-02-11, 03:00:00:000 (+00:00)');
        cy.get('tbody td').contains('2017-02-11, 03:00:00:000 (+00:00)');
        cy.findByText('SQL').prev().click();
        cy.get('code')
            .invoke('text')
            .should(
                'include',
                '("customers".created) < (\'2022-07-11 14:23:11\')',
            );
    });

    describe('Sort', () => {});

    describe('Chart type', () => {
        describe('Table', () => {
            describe('Config', () => {
                it('should hide table names from the header according to the config', () => {
                    cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

                    // choose table and select fields
                    cy.findByText('Orders').click();
                    cy.findByText('First name').click();
                    cy.findByText('Unique order count').click();

                    // run query
                    cy.get('button').contains('Run query').click();

                    // open chart
                    cy.findByText('Charts').prev('button').click();

                    // wait for the chart to finish loading
                    cy.findByText('Loading chart').should('not.exist');

                    // open chart menu and change chart type to Table
                    cy.get('button').contains('Bar chart').click();
                    cy.get('[role="menuitem"]').contains('Table').click();

                    // check that chart table headers are correct
                    cy.get('.explorer-chart th')
                        .contains('Customers - First name')
                        .should('exist');

                    // open configuration and flip Show table names in the config
                    cy.get('button').contains('Configure').click();
                    cy.findByText('Show table names')
                        .next('label')
                        .contains('Yes') // table names are not hidden by default
                        .click();

                    // check that chart table headers are correct
                    cy.get('.explorer-chart th')
                        .contains('Customers - First name')
                        .should('not.exist');
                    cy.get('.explorer-chart th')
                        .contains('First name')
                        .should('exist');
                });

                it('should show header overrides according to the config', () => {
                    cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

                    // choose table and select fields
                    cy.findByText('Orders').click();
                    cy.findByText('First name').click();
                    cy.findByText('Unique order count').click();

                    // run query
                    cy.get('button').contains('Run query').click();

                    // open chart
                    cy.findByText('Charts').prev('button').click();

                    // wait for the chart to finish loading
                    cy.findByText('Loading chart').should('not.exist');

                    // open chart menu and change chart type to Table
                    cy.get('button').contains('Bar chart').click();
                    cy.get('[role="menuitem"]').contains('Table').click();

                    // check that chart table headers are correct
                    cy.get('.explorer-chart th')
                        .eq(1)
                        .contains('Customers - First name')
                        .should('exist');

                    // open configuration and flip Show table names in the config
                    cy.get('button').contains('Configure').click();
                    cy.findByPlaceholderText('Customers First name')
                        .focus()
                        .type('Overridden header')
                        .blur();

                    // check that chart table headers are overridden
                    cy.get('.explorer-chart th')
                        .eq(1)
                        .contains('Overridden header')
                        .should('exist');
                });
            });
        });
    });
});
