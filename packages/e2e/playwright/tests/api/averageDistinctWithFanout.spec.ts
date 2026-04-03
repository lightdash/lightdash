import { SEED_PROJECT } from '@lightdash/common';
import { test, expect } from '../../fixtures';
import type { APIRequestContext } from '@playwright/test';

const apiUrl = '/api/v2';

type ResultRow = Record<string, { value: { raw: unknown; formatted: string } }>;

async function runMetricQuery(
    request: APIRequestContext,
    projectUuid: string,
    query: Record<string, unknown>,
): Promise<ResultRow[]> {
    const response = await request.post(
        `${apiUrl}/projects/${projectUuid}/query/metric-query`,
        {
            data: {
                context: 'exploreView',
                query,
            },
        },
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    const { queryUuid } = body.results;

    // Poll until results are ready
    const maxAttempts = 50;
    for (let i = 0; i < maxAttempts; i++) {
        const resultResponse = await request.get(
            `${apiUrl}/projects/${projectUuid}/query/${queryUuid}`,
        );
        const resultBody = await resultResponse.json();

        if (resultBody.results.error) {
            throw new Error(`Query failed: ${resultBody.results.error}`);
        }
        if (resultBody.results.status === 'ready') {
            return resultBody.results.rows;
        }
        // Wait briefly before polling again
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Query timed out');
}

function getRawValue(row: ResultRow, fieldId: string): unknown {
    return row[fieldId].value.raw;
}

test.describe('average_distinct fanout deduplication', () => {
    const projectUuid = SEED_PROJECT.project_uuid;

    test('average_distinct should match AVG on a non-fanned-out table', async ({
        adminPage: page,
    }) => {
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

        const ordersRows = await runMetricQuery(
            page.request,
            projectUuid,
            ordersQuery,
        );
        expect(ordersRows).toHaveLength(1);

        const ordersAvgAmount = Number(
            getRawValue(ordersRows[0], 'orders_average_order_amount'),
        );
        expect(ordersAvgAmount).toBeGreaterThan(0);
        expect(ordersAvgAmount % 1).not.toBe(0);

        const customersRows = await runMetricQuery(
            page.request,
            projectUuid,
            customersQuery,
        );
        expect(customersRows).toHaveLength(1);

        const customersDedupedAvg = Number(
            getRawValue(
                customersRows[0],
                'customers_avg_order_amount_deduped',
            ),
        );

        // Both should produce the same average (within floating point tolerance)
        // Dataset includes orders with NULL amounts (no payments),
        // so this also validates that average_distinct skips NULLs correctly
        expect(customersDedupedAvg).toBeCloseTo(ordersAvgAmount, 1);
    });

    test('average_distinct should return NULL when all values are NULL', async ({
        adminPage: page,
    }) => {
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

        const rows = await runMetricQuery(
            page.request,
            projectUuid,
            customersQuery,
        );
        expect(rows).toHaveLength(1);
        const raw = getRawValue(
            rows[0],
            'customers_avg_order_amount_deduped',
        );
        expect(raw).toBeNull();
    });
});
