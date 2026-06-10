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

    it('sum_distinct should INNER JOIN on distinct_keys when the user selects them as dimensions (SPK-450)', () => {
        // Multi-key sum_distinct: distinct_keys = [order_id, payment_method].
        // Selecting both keys as dimensions should produce one (correct) value per
        // (order_id, payment_method), via INNER JOIN on the dedup CTE.
        const groundTruthQuery = {
            exploreName: 'payments',
            dimensions: ['payments_order_id', 'payments_payment_method'],
            metrics: ['payments_total_revenue'],
            filters: {},
            sorts: [
                { fieldId: 'payments_order_id', descending: false },
                { fieldId: 'payments_payment_method', descending: false },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        const dedupedQuery = {
            exploreName: 'customer_order_payments',
            dimensions: [
                'customer_order_payments_order_id',
                'customer_order_payments_payment_method',
            ],
            metrics: [
                'customer_order_payments_total_payment_by_method_per_order',
            ],
            filters: {},
            sorts: [
                {
                    fieldId: 'customer_order_payments_order_id',
                    descending: false,
                },
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

        runMetricQuery(projectUuid, groundTruthQuery).then(
            (groundTruthRows) => {
                expect(groundTruthRows.length).to.be.greaterThan(1);

                const expected: Record<string, number> = {};
                groundTruthRows.forEach((row) => {
                    const key = `${String(row.payments_order_id)}|${String(
                        row.payments_payment_method,
                    )}`;
                    expected[key] = Number(row.payments_total_revenue);
                });

                runMetricQuery(projectUuid, dedupedQuery).then(
                    (dedupedRows) => {
                        expect(dedupedRows.length).to.eq(
                            groundTruthRows.length,
                        );

                        // Distinct values across rows confirms it's NOT a global scalar CROSS JOIN.
                        const distinctValues = new Set(
                            dedupedRows.map((r) =>
                                Number(
                                    r.customer_order_payments_total_payment_by_method_per_order,
                                ),
                            ),
                        );
                        expect(distinctValues.size).to.be.greaterThan(1);

                        dedupedRows.forEach((row) => {
                            const key = `${String(
                                row.customer_order_payments_order_id,
                            )}|${String(
                                row.customer_order_payments_payment_method,
                            )}`;
                            const deduped = Number(
                                row.customer_order_payments_total_payment_by_method_per_order,
                            );
                            expect(deduped, `key=${key}`).to.eq(expected[key]);
                        });
                    },
                );
            },
        );
    });

    it('sum_distinct should return the same global deduplicated total when the selected dimension is not a distinct_key (SPK-450)', () => {
        // Ground truth: direct SUM on payments table without grouping (no fan-out)
        const paymentsTotalQuery = {
            exploreName: 'payments',
            dimensions: [],
            metrics: ['payments_total_revenue'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        // sum_distinct on the wide (fanned-out) table grouped by a non-distinct-key dimension.
        // Selected dimensions must NOT participate in the dedup PARTITION BY — every row should
        // show the same global total, since payment_method isn't part of distinct_keys.
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

        runMetricQuery(projectUuid, paymentsTotalQuery).then((totalRows) => {
            expect(totalRows).to.have.length(1);
            const expectedTotal = Number(totalRows[0].payments_total_revenue);
            expect(expectedTotal).to.be.greaterThan(0);

            runMetricQuery(projectUuid, wideTableQuery).then(
                (wideTableRows) => {
                    expect(wideTableRows.length).to.be.greaterThan(1);

                    wideTableRows.forEach((row) => {
                        const method = String(
                            row.customer_order_payments_payment_method,
                        );
                        const deduped = Number(
                            row.customer_order_payments_total_payment_amount_deduped,
                        );

                        expect(deduped, `payment_method=${method}`).to.eq(
                            expectedTotal,
                        );
                    });
                },
            );
        });
    });
});
