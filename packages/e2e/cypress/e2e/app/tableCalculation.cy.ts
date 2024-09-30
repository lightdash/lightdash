import { SEED_PROJECT } from '@lightdash/common';

describe('Table calculations', () => {
    beforeEach(() => {
        cy.login();
    });

    it('I can create a quick table calculation (rank in column)', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/payments`);

        // Select metrics and dimensions
        cy.findByText('Payment method').click();
        cy.findByText('Total revenue').click();

        // Select quick calculation
        cy.get('thead').find('.mantine-ActionIcon-root').eq(1).click();
        cy.contains('Rank in column').click();

        // Show SQL
        cy.findByTestId('Results-card-expand').click(); // Close results
        cy.findByTestId('SQL-card-expand').click();

        const sqlLines = [
            `RANK() OVER(ORDER BY "payments_total_revenue" ASC) AS "rank_in_column_of_total_revenue"`,
            `FROM metrics`,
        ];
        sqlLines.forEach((line) => {
            cy.get('pre').contains(line);
        });
    });

    it('I can create a quick table calculation (running total)', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/payments`);

        // Select metrics and dimensions
        cy.findByText('Payment method').click();
        cy.findByText('Total revenue').click();

        // Select quick calculation
        cy.get('thead').find('.mantine-ActionIcon-root').eq(1).click();
        cy.contains('Running total').click();

        // Show SQL
        cy.findByTestId('Results-card-expand').click(); // Close results
        cy.findByTestId('SQL-card-expand').click();

        const sqlLines = [
            `SUM("payments_total_revenue") OVER( ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`,
            `AS "running_total_of_total_revenue"`,
            `FROM metrics`,
        ];
        sqlLines.forEach((line) => {
            cy.get('pre').contains(line);
        });
    });

    it('I can create a string table calculation', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        // Select metrics and dimensions
        cy.findByText('Order date').click();
        cy.contains('Month').click();
        cy.findByText('Total order amount').click();

        cy.findByText('Table calculation').click();

        cy.findByPlaceholderText('E.g. Cumulative order count').type('Ranking');

        cy.get('#ace-editor').type(
            `'rank_' || RANK() OVER(ORDER BY \${orders.total_order_amount} ASC)`,
            { parseSpecialCharSequences: false },
        );
        cy.get(`.mantine-Select-input[value='number']`).click();
        cy.contains('string').click();
        cy.get('form').contains('Save').click({ force: true });
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
        cy.get('button').contains('Run query').click();

        cy.contains('Loading results'); // wait for results to load
        // Check valid results
        cy.contains('rank_1');
        cy.contains('rank_2').should('not.exist');
    });

    it('I can create a number table calculation', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        // Select metrics and dimensions
        cy.findByText('Order date').click();
        cy.contains('Month').click();
        cy.findByText('Total order amount').click();

        cy.findByText('Table calculation').click();

        cy.findByPlaceholderText('E.g. Cumulative order count').type('Ranking');

        cy.get('#ace-editor').type(
            `RANK() OVER(ORDER BY \${orders.total_order_amount} ASC) * 100`,
            { parseSpecialCharSequences: false },
        );
        // Defaults to number
        cy.get('form').contains('Save').click({ force: true });
        // Check valid results
        cy.contains('100');
        cy.contains('200');
        cy.contains('300');
        cy.contains('400');

        // Add string filter
        cy.findByTestId('Filters-card-expand').click();
        cy.contains('Add filter').click();
        cy.findByPlaceholderText('Search field...').type(
            'Ranking{downArrow}{enter}',
        );

        cy.get('.tabler-icon-123'); // Check if the 123 icon is present, which means the table calculation is a number type
        cy.get(".mantine-Select-input[value='is']").click();
        cy.contains('greater than').click(); // If the type is string, this option will not be available and it will fail when running the query

        cy.findByPlaceholderText('Enter value').clear().type('250');
        cy.get('button').contains('Run query').click();

        cy.contains('Loading results'); // wait for results to load
        // Check valid results
        cy.contains('300');
        cy.contains('100').should('not.exist');
    });
});
