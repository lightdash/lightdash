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
});
