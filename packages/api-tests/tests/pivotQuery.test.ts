import { SEED_PROJECT } from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import {
    createAndRefreshProject,
    deleteProjectsByName,
    getAvailableWarehouseConfigs,
} from '../helpers/projects';

const apiUrl = '/api/v2';

const fieldReference = (fieldId: string) => `\${${fieldId}}`;

type PivotResults = {
    status: string;
    columns?: Record<string, unknown>;
    rows: Record<string, unknown>[];
    pivotDetails?: {
        valuesColumns?: Array<{ referenceField: string }>;
    } | null;
    error?: { message: string } | string | null;
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

    // Up to 60s (300 × 200ms) to tolerate slow CI / cold caches.
    for (let i = 0; i < 300; i += 1) {
        const resp = await client.get<Body<PivotResults>>(
            `${apiUrl}/projects/${projectUuid}/query/${queryUuid}?page=1&pageSize=500`,
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

const getRawValues = (
    rows: Record<string, unknown>[],
    fieldId: string,
): unknown[] =>
    rows
        .map((row) => {
            const cell = row[fieldId] as
                | { value?: { raw?: unknown } }
                | undefined;
            return cell?.value?.raw ?? cell;
        })
        .filter((value) => value !== undefined && value !== null);

type PivotTestContext = { client: ApiClient; projectUuid: string };

function registerPivotQueryTests(getContext: () => PivotTestContext) {
    it('excludes a sort-only metric from pivoted results', async () => {
        const { client, projectUuid } = getContext();
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
            client,
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
        const { client, projectUuid } = getContext();
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
                    sql: `rank() over (order by ${fieldReference(
                        'orders.total_order_amount',
                    )} desc)`,
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
            sortOnlyColumns: [
                { reference: 'revenue_rank', aggregation: 'any' },
            ],
            sortBy: [{ reference: 'revenue_rank', direction: 'ASC' }],
        };

        const results = await runPivotQuery(
            client,
            projectUuid,
            query,
            pivotConfiguration,
        );

        expect(results.rows.length).toBeGreaterThan(1);
        expect(getValuesColumnReferences(results)).not.toContain(
            'revenue_rank',
        );
    });

    it('keeps a self-sorted x-axis table calculation as an index column', async () => {
        const { client, projectUuid } = getContext();
        const query = {
            exploreName: 'orders',
            dimensions: [
                'customers_first_name',
                'customers_last_name',
                'orders_order_date_week',
            ],
            metrics: ['orders_total_order_amount'],
            filters: {},
            sorts: [{ fieldId: 'customer_label', descending: false }],
            limit: 500,
            tableCalculations: [
                {
                    name: 'customer_label',
                    displayName: 'Customer label',
                    type: 'string',
                    sql: `concat(${fieldReference(
                        'customers.first_name',
                    )}, ' ', ${fieldReference('customers.last_name')})`,
                },
            ],
            additionalMetrics: [],
            metricOverrides: {},
        };

        // customer_label is the x-axis sorted by itself, so it stays an index
        // column (not a sort-only column) and its values appear in the output.
        const pivotConfiguration = {
            indexColumn: [
                { reference: 'customer_label', type: 'category' },
                { reference: 'customers_first_name', type: 'category' },
                { reference: 'customers_last_name', type: 'category' },
            ],
            groupByColumns: [{ reference: 'orders_order_date_week' }],
            valuesColumns: [
                { reference: 'orders_total_order_amount', aggregation: 'any' },
            ],
            sortBy: [{ reference: 'customer_label', direction: 'ASC' }],
        };

        const results = await runPivotQuery(
            client,
            projectUuid,
            query,
            pivotConfiguration,
        );

        const labels = getRawValues(results.rows, 'customer_label');
        expect(labels.length).toBeGreaterThan(1);
        expect(new Set(labels).size).toBeGreaterThan(1);
    });

    it('keeps a self-sorted x-axis metric as an index column', async () => {
        const { client, projectUuid } = getContext();
        const query = {
            exploreName: 'orders',
            dimensions: ['orders_is_completed'],
            metrics: ['orders_unique_order_count', 'orders_total_order_amount'],
            filters: {},
            sorts: [{ fieldId: 'orders_unique_order_count', descending: true }],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            metricOverrides: {},
        };

        // orders_unique_order_count is the x-axis metric sorted by itself, so it
        // stays an index column and its values appear in the output.
        const pivotConfiguration = {
            indexColumn: {
                reference: 'orders_unique_order_count',
                type: 'category',
            },
            groupByColumns: [{ reference: 'orders_is_completed' }],
            valuesColumns: [
                { reference: 'orders_total_order_amount', aggregation: 'any' },
            ],
            sortBy: [
                { reference: 'orders_unique_order_count', direction: 'DESC' },
            ],
        };

        const results = await runPivotQuery(
            client,
            projectUuid,
            query,
            pivotConfiguration,
        );

        expect(
            getRawValues(results.rows, 'orders_unique_order_count').length,
        ).toBeGreaterThan(0);
    });
}

// Postgres is covered by the seed project below, so exclude it here and run the
// suite against every other warehouse whose credentials are available.
const pivotWarehouseEntries = getAvailableWarehouseConfigs({
    includePostgres: false,
});

describe('Pivot query API', () => {
    // Postgres: reuse the already-seeded project (no create/refresh needed).
    describe('postgres (seed project)', () => {
        let admin: ApiClient;

        beforeAll(async () => {
            admin = await login();
        });

        registerPivotQueryTests(() => ({
            client: admin,
            projectUuid: SEED_PROJECT.project_uuid,
        }));
    });

    // Every other warehouse: spin up a project against its jaffle dataset and
    // run the same pivot suite. Skipped automatically when creds are absent.
    for (const { name, config } of pivotWarehouseEntries) {
        describe(name, () => {
            const projectName = `pivot ${name} parity test`;
            let admin: ApiClient;
            let projectUuid: string;

            beforeAll(async () => {
                admin = await login();
                projectUuid = await createAndRefreshProject(
                    admin,
                    projectName,
                    config,
                );
            }, 180_000);

            afterAll(async () => {
                if (projectUuid) {
                    await deleteProjectsByName(admin, [projectName]);
                }
            });

            registerPivotQueryTests(() => ({ client: admin, projectUuid }));
        });
    }
});
