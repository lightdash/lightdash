import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v2';

type ResultRow = Record<string, { value: { raw: unknown; formatted: string } }>;

/**
 * Executes an async metric query and returns the result rows.
 */
const runMetricQuery = (
    projectUuid: string,
    query: Record<string, unknown>,
): Cypress.Chainable<ResultRow[]> => {
    const checkResults = (queryUuid: string): Cypress.Chainable<ResultRow[]> =>
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
                            rows: ResultRow[];
                            error?: string;
                        };
                    }>,
                ): ResultRow[] | Cypress.Chainable<ResultRow[]> => {
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
            ) as Cypress.Chainable<ResultRow[]>;

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
        }) as unknown as Cypress.Chainable<ResultRow[]>;
};

const getRawValue = (row: ResultRow, fieldId: string): unknown =>
    row[fieldId].value.raw;

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
                getRawValue(ordersRows[0], 'orders_total_order_amount'),
            );
            expect(ordersTotalAmount).to.be.greaterThan(0);

            runMetricQuery(projectUuid, customersQuery).then(
                (customersRows) => {
                    expect(customersRows).to.have.length(1);

                    const customersDedupedAmount = Number(
                        getRawValue(
                            customersRows[0],
                            'customers_total_order_amount_deduped',
                        ),
                    );

                    expect(customersDedupedAmount).to.eq(ordersTotalAmount);
                },
            );
        });
    });

    it('sum_distinct should return grouped values when the user selects distinct keys as dimensions', () => {
        // Multi-key sum_distinct: distinct_keys = [order_id, payment_method].
        // Selecting both keys as dimensions should produce one (correct) value per
        // (order_id, payment_method), via INNER JOIN on the dedup CTE.
        const totalQuery = {
            exploreName: 'customer_order_payments',
            dimensions: [],
            metrics: [
                'customer_order_payments_total_payment_by_method_per_order',
            ],
            filters: {},
            sorts: [],
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

        runMetricQuery(projectUuid, totalQuery).then((totalRows) => {
            expect(totalRows).to.have.length(1);
            const total = Number(
                getRawValue(
                    totalRows[0],
                    'customer_order_payments_total_payment_by_method_per_order',
                ),
            );
            expect(total).to.be.greaterThan(0);

            runMetricQuery(projectUuid, dedupedQuery).then((dedupedRows) => {
                expect(dedupedRows.length).to.be.greaterThan(1);

                const groupedValues = dedupedRows.map((row) =>
                    Number(
                        getRawValue(
                            row,
                            'customer_order_payments_total_payment_by_method_per_order',
                        ),
                    ),
                );
                const groupedSum = Number(
                    groupedValues
                        .reduce((sum, value) => sum + value, 0)
                        .toFixed(2),
                );

                // Distinct values across rows confirms it's NOT a global scalar CROSS JOIN.
                expect(new Set(groupedValues).size).to.be.greaterThan(1);
                expect(groupedSum).to.eq(total);

                dedupedRows.forEach((row) => {
                    expect(
                        getRawValue(row, 'customer_order_payments_order_id'),
                    ).to.not.eq(null);
                    expect(
                        getRawValue(
                            row,
                            'customer_order_payments_payment_method',
                        ),
                    ).to.not.eq(null);
                });
            });
        });
    });

    it('sum_distinct grouped by dimension outside distinct_keys should return per-group values', () => {
        const totalQuery = {
            exploreName: 'customer_order_payments',
            dimensions: [],
            metrics: ['customer_order_payments_total_payment_amount_deduped'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        // sum_distinct on the wide table grouped by payment_method.
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

        runMetricQuery(projectUuid, totalQuery).then((totalRows) => {
            expect(totalRows).to.have.length(1);
            const total = Number(
                getRawValue(
                    totalRows[0],
                    'customer_order_payments_total_payment_amount_deduped',
                ),
            );
            expect(total).to.be.greaterThan(0);

            runMetricQuery(projectUuid, wideTableQuery).then(
                (wideTableRows) => {
                    expect(wideTableRows.length).to.be.greaterThan(1);

                    const groupedValues = wideTableRows.map((row) =>
                        Number(
                            getRawValue(
                                row,
                                'customer_order_payments_total_payment_amount_deduped',
                            ),
                        ),
                    );
                    const groupedSum = Number(
                        groupedValues
                            .reduce((sum, value) => sum + value, 0)
                            .toFixed(2),
                    );

                    expect(new Set(groupedValues).size).to.be.greaterThan(1);
                    expect(groupedSum).to.eq(total);
                },
            );
        });
    });
});
