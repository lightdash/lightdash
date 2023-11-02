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
        cy.findByText('Total order amount').click();
        cy.get('button').contains('Run query').click();

        // Check valid results
        cy.contains('0-6');
        cy.contains('$193.00');
        cy.contains('6-12');
        cy.contains('$224.00');

        // Show SQL
        cy.findByTestId('Results-card-expand').click(); // Close results
        cy.findByTestId('SQL-card-expand').click();

        const sqlLines = [
            `WITH  amount_amount_range_cte AS (`,
            `CAST(MIN("payments".amount) + (MAX("payments".amount) - MIN("payments".amount) ) AS INT) as ratio`,
            `WHEN "payments".amount >= amount_amount_range_cte.ratio * 0 / 5`,
            `ELSE CONCAT(amount_amount_range_cte.ratio * 4 / 5, '-', amount_amount_range_cte.max_id)`,
            `CROSS JOIN amount_amount_range_cte`,
            `GROUP BY 1`,
        ];
        sqlLines.forEach((line) => {
            cy.get('pre').contains(line);
        });
    });
});
