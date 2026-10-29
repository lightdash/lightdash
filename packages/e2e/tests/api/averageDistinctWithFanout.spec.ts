import { SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    getRawValue,
    loginAs,
    runMetricQuery,
    SEED_USERS,
    test,
} from '../../support/test';

test.describe('average_distinct fanout deduplication', () => {
    const projectUuid = SEED_PROJECT.project_uuid;

    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('average_distinct should match AVG on a non-fanned-out table', async ({
        api,
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

        const ordersRows = await runMetricQuery(api, projectUuid, ordersQuery);
        expect(ordersRows).toHaveLength(1);

        const ordersAvgAmount = Number(
            getRawValue(ordersRows[0], 'orders_average_order_amount'),
        );
        expect(ordersAvgAmount).toBeGreaterThan(0);
        expect(ordersAvgAmount % 1).not.toBe(0);

        const customersRows = await runMetricQuery(
            api,
            projectUuid,
            customersQuery,
        );
        expect(customersRows).toHaveLength(1);

        const customersDedupedAvg = Number(
            getRawValue(customersRows[0], 'customers_avg_order_amount_deduped'),
        );

        // Both should produce the same average (within floating point tolerance)
        // Dataset includes orders with NULL amounts (no payments),
        // so this also validates that average_distinct skips NULLs correctly
        expect(
            Math.abs(customersDedupedAvg - ordersAvgAmount),
        ).toBeLessThanOrEqual(0.01);
    });

    test('average_distinct should return NULL when all values are NULL', async ({
        api,
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

        const rows = await runMetricQuery(api, projectUuid, customersQuery);
        expect(rows).toHaveLength(1);
        const raw = getRawValue(rows[0], 'customers_avg_order_amount_deduped');
        expect(raw).toBe(null);
    });
});
