import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

export const createCustomDimensionChart = (projectUuid) => {
    // This is used by create project to quickly create a custom dimension chart
    // because we don't have charts on new projects created by the e2e tests

    // This metric query is the same in `02_saved_queries`
    cy.request({
        url: `${apiUrl}/projects/${projectUuid}/saved`,
        method: 'POST',
        body: {
            name: 'How do payment methods vary across different amount ranges?"',
            description: 'Payment range by amount',
            tableName: 'payments',
            metricQuery: {
                dimensions: ['payments_payment_method'],
                metrics: ['orders_total_order_amount'],
                filters: {},
                sorts: [
                    { fieldId: 'orders_total_order_amount', descending: true },
                ],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [
                    {
                        id: 'amount_range',
                        name: 'amount range',
                        dimensionId: 'payments_amount',
                        binType: 'fixed_number',
                        binNumber: 5,
                        table: 'payments',
                    },
                ],
            },
            chartConfig: {
                type: 'cartesian',
                config: {
                    layout: {
                        flipAxes: false,
                        xField: 'amount_range',
                        yField: ['orders_total_order_amount'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                encode: {
                                    xRef: { field: 'amount_range' },
                                    yRef: {
                                        field: 'orders_total_order_amount',
                                    },
                                },
                                type: 'bar',
                                yAxisIndex: 0,
                            },
                        ],
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'amount_range',
                    'orders_total_order_amount',
                    'payments_payment_method',
                ],
            },
            pivotConfig: {
                columns: ['payments_payment_method'],
            },
        },
    }).then((r) => {
        expect(r.status).to.eq(200);
    });
};

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

    it.skip('I can create a custom dimension chart from api', () => {
        // This is tested on createProject.cy.ts, you can enable this if you want to test this directly
        createCustomDimensionChart(SEED_PROJECT.project_uuid);
    });
    it.skip('I can view an existing custom dimension chart', () => {
        // This is tested on createProject.cy.ts, you can enable this if you want to test this directly
        testCustomDimensions(SEED_PROJECT.project_uuid);
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
            `CAST(MIN("payments".amount) + (MAX("payments".amount) - MIN("payments".amount) ) AS INT) as ratio`,
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
