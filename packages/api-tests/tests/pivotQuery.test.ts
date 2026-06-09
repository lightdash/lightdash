import { SEED_PROJECT } from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v2';

type PivotResults = {
    status: string;
    columns?: Record<string, unknown>;
    rows: Record<string, unknown>[];
    pivotDetails?: {
        valuesColumns?: Array<{ referenceField: string }>;
    } | null;
    error?: { message: string } | null;
};

/**
 * POST a pivoted metric query and poll until the results are ready.
 *
 * Driving the API directly (no browser) avoids the explore-page auto-fetch
 * that races the pivoted vs non-pivoted result polls in the equivalent UI test.
 */
async function runPivotQuery(
    client: ApiClient,
    projectUuid: string,
    query: Record<string, unknown>,
    pivotConfiguration: Record<string, unknown>,
): Promise<PivotResults> {
    const executeResp = await client.post<Body<{ queryUuid: string }>>(
        `${apiUrl}/projects/${projectUuid}/query/metric-query`,
        { context: 'exploreView', query, pivotConfiguration },
    );
    expect(executeResp.status).toBe(200);
    const { queryUuid } = executeResp.body.results;

    for (let i = 0; i < 30; i += 1) {
        const resp = await client.get<Body<PivotResults>>(
            `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=500`,
        );
        const { results } = resp.body;
        if (results.error) {
            throw new Error(`Query failed: ${results.error.message}`);
        }
        if (results.status === 'ready') {
            return results;
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('Pivot query did not complete in time');
}

const getColumnIds = (results: PivotResults): string[] => [
    ...Object.keys(results.columns ?? {}),
    ...results.rows.flatMap((row) => Object.keys(row)),
];

const getValuesColumnReferences = (results: PivotResults): string[] =>
    (results.pivotDetails?.valuesColumns ?? []).map(
        (column) => column.referenceField,
    );

describe('Pivot query API', () => {
    const projectUuid = SEED_PROJECT.project_uuid;
    let admin: ApiClient;

    beforeAll(async () => {
        admin = await login();
    });

    it('excludes a sort-only metric from pivoted results', async () => {
        const query = {
            exploreName: 'orders',
            dimensions: ['customers_customer_id', 'orders_is_completed'],
            metrics: ['orders_total_order_amount', 'orders_unique_order_count'],
            filters: {},
            sorts: [{ fieldId: 'orders_total_order_amount', descending: true }],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        // orders_unique_order_count is displayed; orders_total_order_amount is
        // only used to sort, so it must not leak into the pivoted output.
        const pivotConfiguration = {
            indexColumn: {
                reference: 'customers_customer_id',
                type: 'category',
            },
            groupByColumns: [{ reference: 'orders_is_completed' }],
            valuesColumns: [
                { reference: 'orders_unique_order_count', aggregation: 'any' },
            ],
            sortOnlyColumns: [
                { reference: 'orders_total_order_amount', aggregation: 'any' },
            ],
            sortBy: [
                { reference: 'orders_total_order_amount', direction: 'DESC' },
            ],
        };

        const results = await runPivotQuery(
            admin,
            projectUuid,
            query,
            pivotConfiguration,
        );

        expect(results.rows.length).toBeGreaterThan(1);
        expect(
            getColumnIds(results).some((columnId) =>
                columnId.includes('orders_total_order_amount'),
            ),
        ).toBe(false);
        expect(getValuesColumnReferences(results)).not.toContain(
            'orders_total_order_amount',
        );
    });

    it('excludes a sort-only table calculation from pivoted results', async () => {
        const query = {
            exploreName: 'orders',
            dimensions: ['customers_customer_id', 'orders_is_completed'],
            metrics: ['orders_total_order_amount'],
            filters: {},
            sorts: [{ fieldId: 'revenue_rank', descending: false }],
            limit: 500,
            tableCalculations: [
                {
                    name: 'revenue_rank',
                    displayName: 'Revenue rank',
                    type: 'number',
                    sql: 'rank() over (order by ${orders.total_order_amount} desc)',
                },
            ],
            additionalMetrics: [],
            metricOverrides: {},
        };

        // revenue_rank is only used to sort, so it must not become a value column.
        const pivotConfiguration = {
            indexColumn: {
                reference: 'customers_customer_id',
                type: 'category',
            },
            groupByColumns: [{ reference: 'orders_is_completed' }],
            valuesColumns: [
                { reference: 'orders_total_order_amount', aggregation: 'any' },
            ],
            sortOnlyColumns: [{ reference: 'revenue_rank', aggregation: 'any' }],
            sortBy: [{ reference: 'revenue_rank', direction: 'ASC' }],
        };

        const results = await runPivotQuery(
            admin,
            projectUuid,
            query,
            pivotConfiguration,
        );

        expect(results.rows.length).toBeGreaterThan(1);
        expect(getValuesColumnReferences(results)).not.toContain('revenue_rank');
    });
});
