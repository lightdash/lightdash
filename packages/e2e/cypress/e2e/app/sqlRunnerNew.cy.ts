import { ChartKind, SEED_PROJECT } from '@lightdash/common';

describe('SQL Runner (new)', () => {
    beforeEach(() => {
        cy.login();
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/sql-runner`);
    });

    it('Should verify that the query is autocompleted, run, and the results are displayed', () => {
        // Verify the autocomplete SQL query
        cy.contains('jaffle').click().wait(500);
        cy.contains('orders').click();
        cy.contains(
            '.monaco-editor',
            'SELECT * FROM "postgres"."jaffle"."orders"',
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
            'SELECT * FROM "postgres"."jaffle"."customers"',
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
        cy.contains('jaffle').click().wait(500);
        cy.contains('customers').click();
        cy.contains(
            '.monaco-editor',
            'SELECT * FROM "postgres"."jaffle"."customers"',
        );
        cy.contains('Run query').click();
        cy.get('table thead th').eq(0).should('contain.text', 'customer_id');

        // Verify that the chart is ready to be configured
        cy.contains('label', 'Chart').click();
        cy.get('.echarts-for-react')
            .find('text')
            .contains('First name')
            .should('be.visible');
        cy.get('.echarts-for-react')
            .find('text')
            .contains('Customer id sum')
            .should('be.visible');

        // Add a new series
        cy.contains('Add').click();
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
        cy.get('input[placeholder="Select X axis"]')
            .siblings()
            .find('button')
            .click();
        cy.contains('Incomplete chart configuration').should('be.visible');
        cy.contains("You're missing an X axis").should('be.visible');
    });
    it('Should verify that the all chart types are displayed', () => {
        // Verify that the Run query button is disabled by default
        cy.contains('Run query').should('be.disabled');

        // Verify that the query is run
        cy.contains('jaffle').click().wait(500);
        cy.contains('customers').click();
        cy.contains(
            '.monaco-editor',
            'SELECT * FROM "postgres"."jaffle"."customers"',
        );
        cy.contains('Run query').click();
        cy.get('table thead th').eq(0).should('contain.text', 'customer_id');

        // Verify that the chart is ready to be configured
        cy.contains('label', 'Chart').click();
        cy.get('.echarts-for-react')
            .find('text')
            .contains('First name')
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
});
