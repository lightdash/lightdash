import { SEED_PROJECT } from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v2';
const projectUuid = SEED_PROJECT.project_uuid;

type QueryResults = {
    status: string;
    error?: { message: string } | string | null;
};

type UnderlyingDataResults = {
    queryUuid: string;
    metricQuery: {
        dimensions: string[];
        metrics: string[];
    };
};

async function waitUntilReady(
    client: ApiClient,
    queryUuid: string,
): Promise<void> {
    // Up to 60s (300 × 200ms) to tolerate slow CI / cold caches.
    for (let i = 0; i < 300; i += 1) {
        const resp = await client.get<Body<QueryResults>>(
            `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=1`,
        );
        const { results } = resp.body;
        if (results.error) {
            const message =
                typeof results.error === 'string'
                    ? results.error
                    : results.error.message;
            throw new Error(`Query failed: ${message}`);
        }
        if (results.status === 'ready') {
            return;
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`Query ${queryUuid} did not complete in time`);
}

async function runMetricQuery(
    client: ApiClient,
    exploreName: string,
    metrics: string[],
): Promise<string> {
    const resp = await client.post<Body<{ queryUuid: string }>>(
        `${apiUrl}/projects/${projectUuid}/query/metric-query`,
        {
            context: 'exploreView',
            query: {
                exploreName,
                dimensions: [],
                metrics,
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
            },
        },
    );
    expect(resp.status).toBe(200);
    const { queryUuid } = resp.body.results;
    await waitUntilReady(client, queryUuid);
    return queryUuid;
}

async function runUnderlyingData(
    client: ApiClient,
    sourceQueryUuid: string,
    underlyingDataItemId: string,
): Promise<UnderlyingDataResults> {
    const resp = await client.post<Body<UnderlyingDataResults>>(
        `${apiUrl}/projects/${projectUuid}/query/underlying-data`,
        {
            context: 'viewUnderlyingData',
            underlyingDataSourceQueryUuid: sourceQueryUuid,
            underlyingDataItemId,
            filters: {},
        },
    );
    expect(resp.status).toBe(200);
    return resp.body.results;
}

const columnsOf = (results: UnderlyingDataResults): string[] =>
    [...results.metricQuery.dimensions, ...results.metricQuery.metrics].sort();

/**
 * `orders.fulfillment_rate` declares `show_underlying_values` with two
 * `orders` fields and `customers.first_name`. The columns must not depend on
 * which table is the explore's base table.
 */
describe('underlying data columns', () => {
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('keeps base-table show_underlying_values columns when the query has no base-table field', async () => {
        const sourceQueryUuid = await runMetricQuery(admin, 'customers', [
            'orders_fulfillment_rate',
        ]);

        const results = await runUnderlyingData(
            admin,
            sourceQueryUuid,
            'orders_fulfillment_rate',
        );

        expect(results.metricQuery.dimensions).toContain(
            'customers_first_name',
        );
        expect(columnsOf(results)).toEqual([
            'customers_first_name',
            'orders_status',
            'orders_total_order_amount',
        ]);
        await waitUntilReady(admin, results.queryUuid);
    });

    it('returns the same columns when the metric table is the base table', async () => {
        const sourceQueryUuid = await runMetricQuery(admin, 'orders', [
            'orders_fulfillment_rate',
        ]);

        const results = await runUnderlyingData(
            admin,
            sourceQueryUuid,
            'orders_fulfillment_rate',
        );

        expect(columnsOf(results)).toEqual([
            'customers_first_name',
            'orders_status',
            'orders_total_order_amount',
        ]);
        await waitUntilReady(admin, results.queryUuid);
    });

    it('applies the base table default_show_underlying_values when the query only uses joined-table fields', async () => {
        // `payments` declares `default_show_underlying_values` with
        // `orders.customer_id` and the base-table metric `unique_payment_count`.
        const sourceQueryUuid = await runMetricQuery(admin, 'payments', [
            'orders_unique_order_count',
        ]);

        const results = await runUnderlyingData(
            admin,
            sourceQueryUuid,
            'orders_unique_order_count',
        );

        expect(results.metricQuery.dimensions).toEqual(['orders_customer_id']);
        expect(results.metricQuery.metrics).toEqual([
            'payments_unique_payment_count',
        ]);
        await waitUntilReady(admin, results.queryUuid);
    });
});
