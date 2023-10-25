import { SEED_PROJECT } from '@lightdash/common';

// eslint-disable-next-line import/prefer-default-export
export const testCustomDimensions = (projectUuid) => {
    // Test custom dimension by going into an existing chart with custom dimensions and running the query
    // This is also used in createProject.cy.ts to test custom dimensions against all warehouses
    cy.visit(`/projects/${projectUuid}/saved`);
    cy.contains('How do payment methods vary').click();
    cy.contains('0-6');
    cy.contains('6-12');
};
describe('Custom dimensions', () => {
    beforeEach(() => {
        cy.login();
    });

    it('I can view an existing custom dimension chart', () => {
        testCustomDimensions(SEED_PROJECT.project_uuid);
    });
    // For testing custom dimensions on different warehouses, see createProject.cy.ts
    it('I can create a bin number', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        cy.findByText('Payments').click();
        cy.contains('Amount').trigger('mouseover');
        cy.get('span.mantine-NavLink-rightSection').eq(1).click();
        cy.findByText('Add custom dimensions').trigger('mouseover');
        cy.contains('Bin').click();

        cy.findByPlaceholderText('Enter custom dimension label').type(
            'amount range',
        );
        cy.get('.mantine-NumberInput-wrapper').clear().type('5');

        cy.findByText('Create custom dimension').click();

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
            `WITH  amount_range_cte AS (`,
            `MIN("payments".amount) + (MAX("payments".amount) - MIN("payments".amount) ) as ratio`,
            `WHEN "payments".amount >= amount_range_cte.ratio * 0 / 5`,
            `ELSE CONCAT(amount_range_cte.ratio * 4 / 5, '-', amount_range_cte.max_id) END`,
            `CROSS JOIN amount_range_cte`,
            `GROUP BY 1`,
        ];
        sqlLines.forEach((line) => {
            cy.get('pre').contains(line);
        });
    });
});
