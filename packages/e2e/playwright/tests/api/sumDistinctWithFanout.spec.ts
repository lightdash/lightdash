import { SEED_PROJECT } from '@lightdash/common';
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../../fixtures';

const apiUrl = '/api/v2';

async function runMetricQuery(
    request: APIRequestContext,
    projectUuid: string,
    query: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
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
    for (let i = 0; i < maxAttempts; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const resultResponse = await request.get(
            `${apiUrl}/projects/${projectUuid}/query/${queryUuid}`,
        );
        // eslint-disable-next-line no-await-in-loop
        const resultBody = await resultResponse.json();

        if (resultBody.results.error) {
            throw new Error(`Query failed: ${resultBody.results.error}`);
        }
        if (resultBody.results.status === 'ready') {
            return resultBody.results.rows;
        }
        // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Query timed out');
}

test.describe('SQL fanout deduplication', () => {
    const projectUuid = SEED_PROJECT.project_uuid;

    test('sum_distinct should prevent SQL fanout inflation when joining customers to orders', async ({
        adminPage: page,
    }) => {
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

        const ordersRows = await runMetricQuery(
            page.request,
            projectUuid,
            ordersQuery,
        );
        expect(ordersRows).toHaveLength(1);

        const ordersTotalAmount = Number(
            ordersRows[0].orders_total_order_amount,
        );
        expect(ordersTotalAmount).toBeGreaterThan(0);

        const customersRows = await runMetricQuery(
            page.request,
            projectUuid,
            customersQuery,
        );
        expect(customersRows).toHaveLength(1);

        const customersDedupedAmount = Number(
            customersRows[0].customers_total_order_amount_deduped,
        );

        expect(customersDedupedAmount).toBe(ordersTotalAmount);
    });

    test('sum_distinct grouped by dimension should return correct per-group values', async ({
        adminPage: page,
    }) => {
        // Query 1: Ground truth -- direct SUM on payments table grouped by payment_method (no fan-out)
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

        const paymentsRows = await runMetricQuery(
            page.request,
            projectUuid,
            paymentsQuery,
        );
        expect(paymentsRows.length).toBeGreaterThan(1);

        // Build lookup: payment_method -> total_revenue
        const expectedByMethod: Record<string, number> = {};
        // eslint-disable-next-line no-restricted-syntax
        for (const row of paymentsRows) {
            const method = String(row.payments_payment_method);
            expectedByMethod[method] = Number(row.payments_total_revenue);
        }

        const wideTableRows = await runMetricQuery(
            page.request,
            projectUuid,
            wideTableQuery,
        );
        expect(wideTableRows.length).toBe(paymentsRows.length);

        // eslint-disable-next-line no-restricted-syntax
        for (const row of wideTableRows) {
            const method = String(row.customer_order_payments_payment_method);
            const deduped = Number(
                row.customer_order_payments_total_payment_amount_deduped,
            );
            const expected = expectedByMethod[method];

            expect(deduped, `payment_method=${method}`).toBe(expected);
        }
    });
});
