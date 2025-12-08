import { SEED_PROJECT } from '@lightdash/common';

describe.skip('Table calculations', () => {
    beforeEach(() => {
        cy.login();
    });

    // todo: move to unit test
    it.skip('I can create a quick table calculation (rank in column)', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/payments`);

        // Select metrics and dimensions
        cy.scrollTreeToItem('Payment method');
        cy.findByText('Payment method').click();
        cy.scrollTreeToItem('Total revenue');
        cy.findByText('Total revenue').click();

        // Select quick calculation
        cy.get('thead').find('.mantine-ActionIcon-root').eq(1).click();
        cy.contains('Rank in column').click();

        // Show SQL
        cy.findByTestId('Results-card-expand').click(); // Close results
        cy.findByTestId('SQL-card-expand').click();

        const sqlLines = [
            `RANK() OVER ( ORDER BY "payments_total_revenue" ASC ) AS "rank_in_column_of_total_revenue"`,
            `FROM metrics`,
        ];
        sqlLines.forEach((line) => {
            cy.getMonacoEditorText().then((text) => {
                expect(text).to.include(line);
            });
        });
    });

    // todo: move to unit test
    it.skip('I can create a quick table calculation (running total)', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/payments`);

        // Select metrics and dimensions
        cy.scrollTreeToItem('Payment method');
        cy.findByText('Payment method').click();
        cy.scrollTreeToItem('Total revenue');
        cy.findByText('Total revenue').click();

        // Select quick calculation
        cy.get('thead').find('.mantine-ActionIcon-root').eq(1).click();
        cy.contains('Running total').click();

        // Show SQL
        cy.findByTestId('Results-card-expand').click(); // Close results
        cy.findByTestId('SQL-card-expand').click();

        const sqlLines = [
            `SUM("payments_total_revenue") OVER ( ORDER BY "payments_payment_method" ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW )`,
            `AS "running_total_of_total_revenue"`,
            `FROM metrics`,
        ];
        sqlLines.forEach((line) => {
            cy.getMonacoEditorText().then((text) => {
                expect(text).to.include(line);
            });
        });
    });

    // todo: move to unit test
    it.skip('I can create a string table calculation', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        // Select metrics and dimensions
        cy.scrollTreeToItem('Order date');
        cy.findByText('Order date').click();
        cy.contains('Month').click();
        cy.scrollTreeToItem('Total order amount');
        cy.findByText('Total order amount').click();

        cy.findByText('Table calculation').click();

        cy.get('#ace-editor').type(
            `'rank_' || RANK() OVER(ORDER BY \${orders.total_order_amount} ASC)`,
            { parseSpecialCharSequences: false },
        );
        cy.get(`.mantine-Select-input[value='number']`).click();
        cy.contains('string').click();

        cy.findByPlaceholderText('E.g. Cumulative order count').type('Ranking');
        cy.get('form').contains('Create').click({ force: true });

        // Run query
        cy.get('button').contains('Run query').click();

        // Check valid results
        cy.contains('rank_1');
        cy.contains('rank_2');

        // Add string filter
        cy.findByTestId('Filters-card-expand').click();
        cy.contains('Add filter').click();
        cy.findByPlaceholderText('Search field...').type(
            'Ranking{downArrow}{enter}',
        );

        cy.get('.tabler-icon-abc'); // Check if the abc icon is present, which means the table calculation is a string type
        cy.get(".mantine-Select-input[value='is']").click();
        cy.contains('starts with').click(); // If the type is number, this option will not be available and it will fail when running the query

        cy.findByPlaceholderText('Enter value(s)').type('rank_1');
        cy.contains('Add "rank_1"').click();

        // Run query
        cy.get('button').contains('Run query').click();

        // Check valid results
        cy.contains('rank_1');
        cy.contains('rank_2').should('not.exist');
    });

    // todo: move to unit test
    it.skip('I can create a number table calculation', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        // Select metrics and dimensions
        cy.scrollTreeToItem('Order date');
        cy.findByText('Order date').click();
        cy.contains('Month').click();
        cy.scrollTreeToItem('Total order amount');
        cy.findByText('Total order amount').click();

        cy.findByText('Table calculation').click();

        cy.get('#ace-editor').type(
            `RANK() OVER(ORDER BY \${orders.total_order_amount} ASC) * 100`,
            { parseSpecialCharSequences: false },
        );

        cy.findByPlaceholderText('E.g. Cumulative order count').type('Ranking');
        // Defaults to number
        cy.get('form').contains('Create').click({ force: true });

        // Run query
        cy.get('button').contains('Run query').click();

        // Check valid results
        cy.contains('100');
        cy.contains('1500');
        cy.contains('1800');
        cy.contains('2000');

        // Add string filter
        cy.findByTestId('Filters-card-expand').click();
        cy.contains('Add filter').click();
        cy.findByPlaceholderText('Search field...').type(
            'Ranking{downArrow}{enter}',
        );

        cy.get('.tabler-icon-123'); // Check if the 123 icon is present, which means the table calculation is a number type
        cy.get(".mantine-Select-input[value='is']").click();
        cy.contains('greater than').click(); // If the type is string, this option will not be available and it will fail when running the query

        cy.findByPlaceholderText('Enter value(s)').clear().type('2000');
        cy.wait(350); // Wait for FilterNumberInput debounce (300ms) to complete
        cy.get('button').contains('Run query').click();

        // Check valid results`
        cy.contains('2200');
        cy.contains('1800').should('not.exist');
    });
});
