import { SEED_PROJECT } from '@lightdash/common';

describe('Custom dimensions', () => {
    beforeEach(() => {
        cy.login();
    });

    it('I can create a bin number', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        cy.findByText('Payments').click();
        cy.contains('Amount').trigger('mouseover');
        cy.get('span.mantine-NavLink-rightSection').eq(1).click();
        cy.findByText('Add custom dimensions').click();

        cy.findByPlaceholderText('Enter custom dimension label').type(
            'amount range',
        );
        cy.get('.mantine-NumberInput-wrapper').clear().type('5');

        cy.findByText('Create').click();

        // Select metric
        cy.findByText('Orders').click();
        cy.findByText('Total order amount').click();
        cy.get('button').contains('Run query').click();

        // Check valid results
        cy.contains('0 - 6');
        cy.contains('$267.40');
        cy.contains('6 - 12');
        cy.contains('$276.98');

        // Show SQL
        cy.findByTestId('Chart-card-expand').click(); // Close chart
        cy.findByTestId('Results-card-expand').click(); // Close results
        cy.findByTestId('SQL-card-expand').click();

        const sqlLines = [
            `WITH  amount_amount_range_cte AS (`,
            `FLOOR((MAX("payments".amount) - MIN("payments".amount)) / 5) AS bin_width`,
            `WHEN "payments".amount >= amount_amount_range_cte.min_id + amount_amount_range_cte.bin_width * 0`,
            `ELSE (amount_amount_range_cte.min_id + amount_amount_range_cte.bin_width * 4`,
            `CROSS JOIN amount_amount_range_cte`,
            `GROUP BY 1`,
        ];
        sqlLines.forEach((line) => {
            cy.get('pre').contains(line);
        });
    });

    it('I can create a custom SQL dimension number', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/payments`);
        cy.contains('Add').click();

        cy.findByPlaceholderText('Enter custom dimension label').type(
            'random number',
        );
        cy.get('#ace-editor').type(`random() + 1`);
        cy.get(`.mantine-Select-input[value='string']`).click();
        cy.contains('number').click();
        cy.findByText('Create').click();

        // Select metric
        cy.findByText('Total revenue').click();
        cy.get('button').contains('Run query').click();

        // Show SQL
        cy.findByTestId('Chart-card-expand').click(); // Close chart
        cy.findByTestId('Results-card-expand').click(); // Close results
        cy.findByTestId('SQL-card-expand').click();

        const sqlLines = [
            `(random() + 1) AS "random_number",`,
            `SUM("payments".amount) AS "payments_total_revenue"`,
            `FROM "postgres"."jaffle"."payments" AS "payments"`,
            `GROUP BY 1`,
            `ORDER BY "payments_total_revenue" DESC`,
        ];
        sqlLines.forEach((line) => {
            cy.get('pre').contains(line);
        });
    });

    it('I can create a custom SQL dimension string', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/payments`);
        cy.contains('Add').click();

        cy.findByPlaceholderText('Enter custom dimension label').type(
            'payment method',
        );
        cy.get('#ace-editor').type(
            `'payment_' || \${payments.payment_method}`,
            { parseSpecialCharSequences: false },
        );
        // Defaults to string
        cy.findByText('Create').click();

        // Select metric
        cy.findByText('Total revenue').click();
        cy.get('button').contains('Run query').click();

        // Check results
        cy.contains('payment_credit_card');
        cy.contains(994.16);
        // Show SQL
        cy.findByTestId('Chart-card-expand').click(); // Close chart
        cy.findByTestId('Results-card-expand').click(); // Close results
        cy.findByTestId('SQL-card-expand').click();

        const sqlLines = [
            `('payment_' || ("payments".payment_method) ) AS "payment_method",`,
            `SUM("payments".amount) AS "payments_total_revenue"`,
            `FROM "postgres"."jaffle"."payments" AS "payments"`,
            `GROUP BY 1`,
            `ORDER BY "payments_total_revenue" DESC`,
        ];
        sqlLines.forEach((line) => {
            cy.get('pre').contains(line);
        });
    });

    it('I can create a custom metric from a custom dimension', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/payments`);
        cy.contains('Add').click();

        cy.findByPlaceholderText('Enter custom dimension label').type(
            'discounted amount',
        );
        cy.get('#ace-editor').type(`(\${orders.amount}) / 10`, {
            parseSpecialCharSequences: false,
        });
        cy.get(`.mantine-Select-input[value='string']`).click();
        cy.contains('number').click();
        cy.findByText('Create').click();

        // Create custom metric
        cy.get('.tabler-icon-dots').click();
        cy.findByText('Max').click();
        cy.findByText('Create').click();

        // Deselect custom metric
        cy.findByText('discounted amount').click();
        // Select dimension
        cy.findByText('Payment method').click();

        // Select metric
        cy.findByText('Total revenue').click();
        cy.get('button').contains('Run query').click();

        // Check results
        cy.contains('bank_transfer');
        cy.contains(5.8);
        // Show SQL
        cy.findByTestId('Chart-card-expand').click(); // Close chart
        cy.findByTestId('Results-card-expand').click(); // Close results
        cy.findByTestId('SQL-card-expand').click();

        const sqlLines = [
            `"payments".payment_method AS "payments_payment_method",`,
            `MAX((("orders".amount)) / 10) AS "payments_discounted amount_max_of_discounted_amount",`,
            `FROM "postgres"."jaffle"."payments" AS "payments"`,
            `GROUP BY 1`,
            `ORDER BY "payments_payment_method"`,
        ];
        sqlLines.forEach((line) => {
            cy.get('pre').contains(line);
        });

        // We deselected the custom dimension, it should not appear in the SQL
        cy.get('pre')
            .contains('((("orders".amount)) / 10) AS "discounted_amount",')
            .should('not.exist');
    });
});
