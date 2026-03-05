import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v2';

/**
 * Executes an async metric query and returns the result rows.
 */
const runMetricQuery = (
    projectUuid: string,
    query: Record<string, unknown>,
): Cypress.Chainable<Record<string, unknown>[]> => {
    const checkResults = (queryUuid: string): Cypress.Chainable<unknown> =>
        cy
            .request({
                url: `${apiUrl}/projects/${projectUuid}/query/${queryUuid}`,
                method: 'GET',
            })
            .then(
                (
                    resp: Cypress.Response<{
                        results: {
                            status: string;
                            rows: Record<string, unknown>[];
                            error?: string;
                        };
                    }>,
                ) => {
                    if (resp.body.results.error) {
                        throw new Error(
                            `Query failed: ${resp.body.results.error}`,
                        );
                    }
                    if (resp.body.results.status !== 'ready') {
                        cy.wait(200);
                        return checkResults(queryUuid);
                    }
                    return resp.body.results.rows;
                },
            );

    return cy
        .request({
            url: `${apiUrl}/projects/${projectUuid}/query/metric-query`,
            method: 'POST',
            body: {
                context: 'exploreView',
                query,
            },
        })
        .then((resp) => {
            expect(resp.status).to.eq(200);
            const { queryUuid } = resp.body.results;
            return checkResults(queryUuid);
        });
};

describe('SQL fanout deduplication', () => {
    const projectUuid = SEED_PROJECT.project_uuid;

    beforeEach(() => {
        cy.login();
    });

    it('sum_distinct should prevent SQL fanout inflation when joining customers to orders', () => {
        // Query 1: Direct SUM on the orders table (no join inflation)
        const ordersQuery = {
            exploreName: 'orders',
            dimensions: [],
            metrics: ['orders_total_order_amount'],
            filters: {},
            sorts: [
                {
                    fieldId: 'orders_total_order_amount',
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        // Query 2: sum_distinct on customers table (joined to orders, deduped by order_id)
        const customersQuery = {
            exploreName: 'customers',
            dimensions: [],
            metrics: ['customers_total_order_amount_deduped'],
            filters: {},
            sorts: [
                {
                    fieldId: 'customers_total_order_amount_deduped',
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        runMetricQuery(projectUuid, ordersQuery).then((ordersRows) => {
            expect(ordersRows).to.have.length(1);

            const ordersTotalAmount = Number(
                ordersRows[0].orders_total_order_amount,
            );
            expect(ordersTotalAmount).to.be.greaterThan(0);

            runMetricQuery(projectUuid, customersQuery).then(
                (customersRows) => {
                    expect(customersRows).to.have.length(1);

                    const customersDedupedAmount = Number(
                        customersRows[0].customers_total_order_amount_deduped,
                    );

                    expect(customersDedupedAmount).to.eq(ordersTotalAmount);
                },
            );
        });
    });

    it('sum_distinct grouped by dimension should return correct per-group values', () => {
        // Query 1: Ground truth — direct SUM on payments table grouped by payment_method (no fan-out)
        const paymentsQuery = {
            exploreName: 'payments',
            dimensions: ['payments_payment_method'],
            metrics: ['payments_total_revenue'],
            filters: {},
            sorts: [
                {
                    fieldId: 'payments_payment_method',
                    descending: false,
                },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        // Query 2: sum_distinct on the wide table grouped by payment_method
        // Before the fix, PARTITION BY excluded payment_method, zeroing out all but one row per payment_id
        const wideTableQuery = {
            exploreName: 'customer_order_payments',
            dimensions: ['customer_order_payments_payment_method'],
            metrics: ['customer_order_payments_total_payment_amount_deduped'],
            filters: {},
            sorts: [
                {
                    fieldId: 'customer_order_payments_payment_method',
                    descending: false,
                },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        runMetricQuery(projectUuid, paymentsQuery).then((paymentsRows) => {
            expect(paymentsRows.length).to.be.greaterThan(1);

            // Build lookup: payment_method → total_revenue
            const expectedByMethod: Record<string, number> = {};
            paymentsRows.forEach((row) => {
                const method = String(row.payments_payment_method);
                expectedByMethod[method] = Number(row.payments_total_revenue);
            });

            runMetricQuery(projectUuid, wideTableQuery).then(
                (wideTableRows) => {
                    expect(wideTableRows.length).to.eq(paymentsRows.length);

                    wideTableRows.forEach((row) => {
                        const method = String(
                            row.customer_order_payments_payment_method,
                        );
                        const deduped = Number(
                            row.customer_order_payments_total_payment_amount_deduped,
                        );
                        const expected = expectedByMethod[method];

                        expect(deduped, `payment_method=${method}`).to.eq(
                            expected,
                        );
                    });
                },
            );
        });
    });
});
