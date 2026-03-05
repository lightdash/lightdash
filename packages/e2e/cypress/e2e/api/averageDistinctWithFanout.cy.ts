import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v2';

type ResultRow = Record<string, { value: { raw: unknown; formatted: string } }>;

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

describe('average_distinct fanout deduplication', () => {
    const projectUuid = SEED_PROJECT.project_uuid;

    beforeEach(() => {
        cy.login();
    });

    it('average_distinct should match AVG on a non-fanned-out table', () => {
        const ordersQuery = {
            exploreName: 'orders',
            dimensions: [],
            metrics: ['orders_average_order_amount'],
            filters: {},
            sorts: [
                {
                    fieldId: 'orders_average_order_amount',
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        const customersQuery = {
            exploreName: 'customers',
            dimensions: [],
            metrics: ['customers_avg_order_amount_deduped'],
            filters: {},
            sorts: [
                {
                    fieldId: 'customers_avg_order_amount_deduped',
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

            const ordersAvgAmount = Number(
                getRawValue(ordersRows[0], 'orders_average_order_amount'),
            );
            expect(ordersAvgAmount).to.be.greaterThan(0);
            expect(ordersAvgAmount % 1).to.not.eq(0);

            runMetricQuery(projectUuid, customersQuery).then(
                (customersRows) => {
                    expect(customersRows).to.have.length(1);

                    const customersDedupedAvg = Number(
                        getRawValue(
                            customersRows[0],
                            'customers_avg_order_amount_deduped',
                        ),
                    );

                    // Both should produce the same average (within floating point tolerance)
                    // Dataset includes orders with NULL amounts (no payments),
                    // so this also validates that average_distinct skips NULLs correctly
                    expect(customersDedupedAvg).to.be.closeTo(
                        ordersAvgAmount,
                        0.01,
                    );
                },
            );
        });
    });

    it('average_distinct should return NULL when all values are NULL', () => {
        const customersQuery = {
            exploreName: 'customers',
            dimensions: [],
            metrics: ['customers_avg_order_amount_deduped'],
            filters: {
                dimensions: {
                    id: 'root',
                    and: [
                        {
                            id: 'filter-null-amounts',
                            target: {
                                fieldId: 'orders_amount',
                            },
                            operator: 'isNull',
                            values: [],
                        },
                    ],
                },
            },
            sorts: [
                {
                    fieldId: 'customers_avg_order_amount_deduped',
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        runMetricQuery(projectUuid, customersQuery).then((rows) => {
            expect(rows).to.have.length(1);
            const raw = getRawValue(
                rows[0],
                'customers_avg_order_amount_deduped',
            );
            expect(raw).to.eq(null);
        });
    });
});
