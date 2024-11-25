import { ChartKind, SEED_PROJECT } from '@lightdash/common';

describe('SQL Runner (new)', () => {
    let schema: string;

    beforeEach(() => {
        cy.login();
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/sql-runner`).then(
            () => {
                cy.request(
                    `/api/v1/projects/${SEED_PROJECT.project_uuid}/sqlRunner/tables`,
                ).then((response) => {
                    // eslint-disable-next-line prefer-destructuring
                    schema = Object.keys(response.body.results)[0];
                });
            },
        );
    });

    it('Should verify that the query is autocompleted, run, and the results are displayed', () => {
        // Verify the autocomplete SQL query
        cy.get('.monaco-editor').should('be.visible');
        cy.contains('jaffle').click().wait(500);
        cy.contains('orders').click();
        cy.contains(
            '.monaco-editor',
            `SELECT * FROM "${schema}"."jaffle"."orders"`,
        );

        // Verify that the query is run and the results are displayed
        cy.contains('Run query').click();

        cy.get('table thead th').should('have.length', 12);
        cy.get('table thead th').eq(0).should('contain.text', 'order_id');
        cy.get('table thead th').eq(1).should('contain.text', 'customer_id');
        cy.get('table thead th').eq(2).should('contain.text', 'order_date');
        cy.get('table thead th').eq(3).should('contain.text', 'status');
        cy.get('table tbody tr')
            .first()
            .within(() => {
                cy.get('td').eq(0).should('contain.text', '1');
                cy.get('td').eq(1).should('contain.text', '1');
                cy.get('td')
                    .eq(2)
                    .should('contain.text', '2018-01-01T00:00:00.000Z');
                cy.get('td').eq(3).should('contain.text', 'returned');
            });

        // Verify that the query is saved in the draft history
        cy.get('button[data-testid="sql-query-history-button"]').click();
        cy.get('button[data-testid="sql-query-history-item"]').should(
            'have.length',
            1,
        );

        // Verify that the query is replaced with the new table suggestion and the new results are displayed
        cy.contains('customers').click();
        cy.contains(
            '.monaco-editor',
            `SELECT * FROM "${schema}"."jaffle"."customers"`,
        );
        cy.contains('Run query').click();
        cy.get('table thead th').eq(0).should('contain.text', 'customer_id');

        // TODO: Verify that the user is warned when a query has not been run yet
        // cy.get('.monaco-editor').type(' LIMIT 10');
        // // Expect button that hovering on button `SQL` displays a tooltip with the text `You haven't run this query yet.`
        // // get label element with attribute `data-active="true"`
        // cy.get('label[data-active="true"]')
        //     .contains('SQL')
        //     .trigger('mouseover')
        //     .then(() => {
        //         cy.contains("You haven't run this query yet.").should(
        //             'be.visible',
        //         );
        //     });
    });

    it('Should verify that the chart is displayed', () => {
        // Verify that the Run query button is disabled by default
        cy.contains('Run query').should('be.disabled');

        // Verify that the query is run
        cy.get('.monaco-editor').should('be.visible');
        cy.contains('jaffle').click().wait(500);
        cy.contains('customers').click();
        cy.contains(
            '.monaco-editor',
            `SELECT * FROM "${schema}"."jaffle"."customers"`,
        );
        cy.contains('Run query').click();
        cy.get('table thead th').eq(0).should('contain.text', 'customer_id');

        // Verify that the chart is ready to be configured
        cy.contains('label', 'Chart').click();
        cy.get('.echarts-for-react')
            .find('text')
            .contains('Created')
            .should('be.visible');
        cy.get('.echarts-for-react')
            .find('text')
            .contains('Customer id sum')
            .should('be.visible');

        // Add a new series
        cy.get('button[data-testid="add-y-axis-field"]').click();
        cy.get('.echarts-for-react')
            .find('text')
            .contains('Customer id sum')
            .should('be.visible');
        cy.get('.echarts-for-react')
            .find('text')
            .contains('First name count')
            .should('be.visible');

        // Group by first_name
        cy.get('input[placeholder="Select group by"]').click();
        cy.get('div[role="option"]').contains('first_name').click();
        cy.get('.echarts-for-react')
            .find('text')
            .contains('Customer id aaron')
            .should('be.visible');

        // Verify that the chart is not displayed when the configuration is incomplete
        cy.get('button[data-testid="remove-x-axis-field"]').click();
        cy.contains('Incomplete chart configuration').should('be.visible');
        cy.contains("You're missing an X axis").should('be.visible');
    });
    it('Should verify that the all chart types are displayed', () => {
        // Verify that the Run query button is disabled by default
        cy.contains('Run query').should('be.disabled');

        // Verify that the query is run
        cy.get('.monaco-editor').should('be.visible');
        cy.contains('jaffle').click().wait(500);
        cy.contains('customers').click();
        cy.contains(
            '.monaco-editor',
            `SELECT * FROM "${schema}"."jaffle"."customers"`,
        );
        cy.contains('Run query').click();
        cy.get('table thead th').eq(0).should('contain.text', 'customer_id');

        // Verify that the chart is ready to be configured
        cy.contains('label', 'Chart').click();
        cy.get('.echarts-for-react')
            .find('text')
            .contains('Created')
            .should('be.visible');
        cy.get('.echarts-for-react')
            .find('text')
            .contains('Customer id sum')
            .should('be.visible');

        // Verify that the table is displayed
        cy.get(
            `button[data-testid="visualization-${ChartKind.TABLE}"]`,
        ).click();
        cy.get('table thead th').eq(0).should('contain.text', 'customer_id');

        // Verify that the line chart is displayed
        cy.get(`button[data-testid="visualization-${ChartKind.LINE}"]`).click();
        cy.get(`div[data-testid="chart-view-${ChartKind.LINE}"]`).should(
            'exist',
        );

        // Verify that the pie chart is displayed
        cy.get(`button[data-testid="visualization-${ChartKind.PIE}"]`).click();
        cy.get(`div[data-testid="chart-view-${ChartKind.PIE}"]`).should(
            'exist',
        );

        // Verify that the bar chart is displayed
        cy.get(
            `button[data-testid="visualization-${ChartKind.VERTICAL_BAR}"]`,
        ).click();
        cy.get(
            `div[data-testid="chart-view-${ChartKind.VERTICAL_BAR}"]`,
        ).should('exist');
    });

    it('Should save a chart', () => {
        // Verify that the Run query button is disabled by default
        cy.contains('Run query').should('be.disabled');

        // Verify that the query is run
        cy.get('.monaco-editor').should('be.visible');
        cy.contains('jaffle').click().wait(500);
        cy.contains('customers').click();
        cy.contains(
            '.monaco-editor',
            `SELECT * FROM "${schema}"."jaffle"."customers"`,
        );
        cy.contains('Run query').click();
        cy.get('table thead th').eq(0).should('contain.text', 'customer_id');

        // Verify that the chart is saved
        cy.contains('Save').click();
        cy.get(
            'input[placeholder="eg. How many weekly active users do we have?"]',
        ).type('Customers table SQL chart');
        cy.get('section[role="dialog"]')
            .find('button')
            .contains('Save')
            .click();

        // Verify that the chart is in view mode
        cy.contains('Customers table SQL chart').should('be.visible');
        cy.get(
            `div[data-testid="chart-view-${ChartKind.VERTICAL_BAR}"]`,
        ).should('exist');

        // Verify that the chart is in edit mode and make new changes and fix errors
        cy.contains('Edit chart').click();

        cy.get(
            `div[data-testid="chart-view-${ChartKind.VERTICAL_BAR}"]`,
        ).should('exist');
        cy.contains('customer_id_sum').should('be.visible');

        cy.contains('label', 'SQL').click();
        cy.get('.monaco-editor').should('be.visible');
        cy.get('.monaco-editor')
            .type(`{selectall}{del}SELECT * FROM "${schema}"."jaffle"."orders"`)
            .wait(1000);
        cy.contains('Run query').click();
        cy.get('table thead th').eq(0).should('contain.text', 'order_id');

        // Verify that there are errors to be fixed and fix them
        cy.contains('label', 'Chart').click();
        cy.contains('Column "created" does not exist. Choose another').should(
            'be.visible',
        );
        cy.contains('Save').click();
        cy.get('section[role="dialog"]')
            .find('button')
            .contains('Fix errors')
            .click();
        cy.get('input[placeholder="Select X axis"]').click();
        cy.get('div[role="option"]').contains('customer_id').click();
        cy.get('.echarts-for-react')
            .find('text')
            .contains('Customer id')
            .should('be.visible');

        // Verify that saving changes and going back to view page displays the chart
        cy.contains('Save').click();
        cy.get('button[data-testid="back-to-view-page-button"]').click();
        cy.get(
            `div[data-testid="chart-view-${ChartKind.VERTICAL_BAR}"]`,
        ).should('exist');
        cy.get('.echarts-for-react')
            .find('text')
            .contains('Customer id')
            .should('be.visible');
    });

    it('Should not trigger an extra query to the warehouse when styling a chart', () => {
        // Verify that the Run query button is disabled by default
        cy.contains('Run query').should('be.disabled');

        // Verify that the query is run
        cy.get('.monaco-editor').should('be.visible');
        cy.contains('jaffle').click().wait(500);
        cy.contains('customers').click();
        cy.contains(
            '.monaco-editor',
            `SELECT * FROM "${schema}"."jaffle"."customers"`,
        );
        cy.contains('Run query').click();
        cy.get('table thead th').eq(0).should('contain.text', 'customer_id');

        // Verify that the chart is ready to be configured
        cy.contains('label', 'Chart').click();
        cy.get('.echarts-for-react')
            .find('text')
            .contains('Created')
            .should('be.visible');

        // Intercept the API call we don't expect to happen
        cy.intercept('POST', '**/api/v1/projects/*/sqlRunner/runPivotQuery').as(
            'runPivotQuery',
        );

        // Perform the styling change
        cy.contains('Display').click();
        cy.contains('div', 'X-axis label')
            .closest('.mantine-Stack-root')
            .find('input.mantine-Input-input')
            .type('{selectall}{backspace}New x-axis label');

        // Wait for the chart label to update
        cy.get('.echarts-for-react').within(() => {
            cy.get('text').contains('New x-axis label').should('be.visible');
        });

        // Verify that no extra queries were made
        cy.get('@runPivotQuery.all').should('have.length', 0);

        // Verify that the chart is displayed with the new label
        cy.get(
            `div[data-testid="chart-view-${ChartKind.VERTICAL_BAR}"]`,
        ).should('exist');
        cy.get('.echarts-for-react')
            .find('text')
            .contains('New x-axis label')
            .should('be.visible');
    });
});
