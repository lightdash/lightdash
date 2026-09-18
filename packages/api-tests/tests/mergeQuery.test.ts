import {
    assertUnreachable,
    ChartType,
    DashboardTileTypes,
    FilterOperator,
    getWarehouseDefaultNullsFirst,
    isField,
    MergeJoinType,
    MergeQueryErrorKind,
    QueryExecutionContext,
    SEED_PROJECT,
    SupportedDbtAdapter,
    type ApiCompiledMergeQueryResults,
    type ApiExecuteAsyncDashboardChartQueryResults,
    type ApiExecuteAsyncMergeQueryResults,
    type ApiExecuteAsyncMetricQueryResults,
    type CreateChartInSpace,
    type CreateDashboard,
    type Dashboard,
    type DashboardFilters,
    type ItemsMap,
    type ResultRow,
    type SavedChart,
    type SavedMergeQuery,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { getAvailableWarehouseConfigs } from '../helpers/projects';
import { useSharedWarehouseProject } from '../helpers/shared-projects';
import { uniqueName } from '../helpers/test-isolation';

// Two independent aggregations of the jaffle dataset, joined on the order
// month. The payments explore joins orders, so both sides expose the same
// month dimension. One flag touches merges: `merge-queries` gates the
// Explorer entry point only. A merge runs each source as its own leg on the
// warehouse and joins the results on the compose engine; every merged value
// must equal what its source query returns on its own, and this suite is
// that bar for every credentialed warehouse.
const ordersByMonth = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_total_order_amount'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
};

const paymentsByMonth = {
    exploreName: 'payments',
    dimensions: ['orders_order_date_month'],
    metrics: ['payments_unique_payment_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
};

const mergeQuery = {
    sources: [
        { id: 'orders', metricQuery: ordersByMonth },
        { id: 'payments', metricQuery: paymentsByMonth },
    ],
    joinKey: [
        {
            name: 'order_month',
            fieldIdBySourceId: {
                orders: 'orders_order_date_month',
                payments: 'orders_order_date_month',
            },
        },
    ],
    joinType: 'full',
    tableCalculations: [],
    limit: 500,
};

// The same narrowing expressed as a chart filter and as a dashboard filter,
// so a merge filtered either way is checked against one filtered baseline.
const completedOnly = {
    dimensions: {
        id: 'merge-status-filter-group',
        and: [
            {
                id: 'merge-status-filter',
                target: { fieldId: 'orders_status' },
                operator: FilterOperator.EQUALS,
                values: ['completed'],
            },
        ],
    },
};
const completedOnlyDashboardFilters: DashboardFilters = {
    dimensions: [
        {
            id: 'dashboard-status-filter',
            target: { fieldId: 'orders_status', tableName: 'orders' },
            operator: FilterOperator.EQUALS,
            values: ['completed'],
            label: undefined,
        },
    ],
    metrics: [],
    tableCalculations: [],
};

// Merged columns are keyed by field id: the join key belongs to the merge
// itself, value columns to the query they came from.
const KEY_FIELD_ID = 'merge_order_month';
const ORDERS_FIELD_ID = 'orders_orders_total_order_amount';
const PAYMENTS_FIELD_ID = 'payments_payments_unique_payment_count';

type PivotedValuesColumn = {
    referenceField: string;
    pivotColumnName: string;
    pivotValues: { referenceField: string; value: unknown }[];
};

type QueryResultsBody = Body<{
    status: string;
    rows: ResultRow[];
    totalResults: number;
    pivotDetails: { valuesColumns: PivotedValuesColumn[] } | null;
}>;

const cellOf = (
    row: ResultRow,
    fieldId: string,
): { raw: unknown; formatted: string } => {
    const cell = row[fieldId];
    if (cell === undefined) {
        throw new Error(
            `No "${fieldId}" cell in row ${JSON.stringify(Object.keys(row))}`,
        );
    }
    return { raw: cell.value.raw, formatted: cell.value.formatted };
};

const MERGE_JOIN_TYPES = [
    MergeJoinType.FULL,
    MergeJoinType.LEFT,
    MergeJoinType.INNER,
] as const;

// hasSubscriptionsModel: whether the warehouse dataset carries a current
// build of the jaffle `subscriptions` model. The staging datasets reliably
// mirror only the core models (customers/orders/payments) — BigQuery never
// built `subscriptions` and Trino's build predates the mrr columns — so the
// parameterized merge compiles everywhere but executes only where the model
// exists.
type MergeTestContext = {
    client: ApiClient;
    projectUuid: string;
    hasSubscriptionsModel: boolean;
    /** The project warehouse, whose null placement a sorted merge follows. */
    adapter: SupportedDbtAdapter;
};

const adapterByWarehouseName: Record<string, SupportedDbtAdapter> = {
    postgres: SupportedDbtAdapter.POSTGRES,
    snowflake: SupportedDbtAdapter.SNOWFLAKE,
    bigquery: SupportedDbtAdapter.BIGQUERY,
    databricks: SupportedDbtAdapter.DATABRICKS,
    trino: SupportedDbtAdapter.TRINO,
};

const nullsClause = (adapter: SupportedDbtAdapter, descending: boolean) =>
    getWarehouseDefaultNullsFirst(adapter, descending)
        ? ' NULLS FIRST'
        : ' NULLS LAST';

function registerMergeQueryTests(getContext: () => MergeTestContext) {
    let admin: ApiClient;
    let projectUuid: string;
    let hasSubscriptionsModel: boolean;
    let adapter: SupportedDbtAdapter;

    async function pollQueryResults(
        client: ApiClient,
        queryUuid: string,
        maxRetries = 120,
    ): Promise<QueryResultsBody['results']> {
        // eslint-disable-next-line no-plusplus
        for (let i = 0; i < maxRetries; i++) {
            const resp = await client.get<QueryResultsBody>(
                `/api/v2/projects/${projectUuid}/query/${queryUuid}`,
            );
            const { status } = resp.body.results;
            if (status === 'ready') return resp.body.results;
            if (status === 'error') {
                throw new Error(
                    `Merge query failed: ${JSON.stringify(resp.body.results)}`,
                );
            }
            await new Promise((resolve) => {
                setTimeout(resolve, 500);
            });
        }
        throw new Error('Merge query did not complete in time');
    }

    // The merge-queries flag gates only the frontend entry point; the API
    // endpoints are always available.
    beforeAll(() => {
        ({
            client: admin,
            projectUuid,
            hasSubscriptionsModel,
            adapter,
        } = getContext());
    });

    it('compiles the merge for the project warehouse without errors', async () => {
        const resp = await admin.post<
            Body<{
                sql: string | null;
                coreSql: string | null;
                errors: unknown[];
            }>
        >(`/api/v1/projects/${projectUuid}/mergeQuery/compile`, {
            mergeQuery,
        });

        expect(resp.status).toBe(200);
        expect(resp.body.results.errors).toEqual([]);
        expect(resp.body.results.sql).toContain('FULL OUTER JOIN');
        // The composable core arrives alongside the runnable statement.
        expect(resp.body.results.coreSql).toContain('FULL OUTER JOIN');
        expect(resp.body.results.coreSql).not.toMatch(/ORDER BY/i);
    });

    it('runs a merge through one v2 request and pages joined rows back', async () => {
        const runResp = await admin.post<
            Body<ApiExecuteAsyncMergeQueryResults>
        >(`/api/v2/projects/${projectUuid}/query/merge-query`, {
            mergeQuery,
            context: QueryExecutionContext.EXPLORE,
        });
        expect(runResp.status).toBe(200);
        expect(runResp.body.results.outcome).toBe('started');
        if (runResp.body.results.outcome !== 'started') {
            throw new Error(
                `Merge was refused: ${JSON.stringify(runResp.body.results.errors)}`,
            );
        }

        const results = await pollQueryResults(
            admin,
            runResp.body.results.query.queryUuid,
        );

        expect(results.totalResults).toBeGreaterThan(0);
        const [row] = results.rows;
        expect(Object.keys(row)).toEqual(
            expect.arrayContaining([
                KEY_FIELD_ID,
                ORDERS_FIELD_ID,
                PAYMENTS_FIELD_ID,
            ]),
        );
        // Every seeded month has orders and payments, so a FULL join returns
        // both sides' values on every row — a null here means the join key
        // never matched, which is exactly the regression this guards.
        results.rows.forEach((mergedRow) => {
            expect(mergedRow[ORDERS_FIELD_ID]).not.toBeNull();
            expect(mergedRow[PAYMENTS_FIELD_ID]).not.toBeNull();
        });
    }, 60_000);

    // Saved charts and dashboards this suite persists; deleted even when a
    // test fails.
    const createdChartUuids: string[] = [];
    const createdDashboardUuids: string[] = [];

    afterAll(async () => {
        for (const uuid of createdDashboardUuids) {
            await admin
                .delete(`/api/v1/dashboards/${uuid}`, {
                    failOnStatusCode: false,
                })
                .catch(() => {});
        }
        for (const uuid of createdChartUuids) {
            await admin
                .delete(`/api/v1/saved/${uuid}`, { failOnStatusCode: false })
                .catch(() => {});
        }
    });

    /**
     * Runs a metric query through the ordinary async path and returns its
     * fields and formatted rows — the independent baseline every merged
     * cell is checked against.
     */
    const runSourceQueryWithFields = async (
        metricQuery: Record<string, unknown>,
    ): Promise<{ fields: ItemsMap; rows: ResultRow[] }> => {
        const started = await admin.post<
            Body<ApiExecuteAsyncMetricQueryResults>
        >(`/api/v2/projects/${projectUuid}/query/metric-query`, {
            context: 'exploreView',
            query: metricQuery,
        });
        expect(started.status).toBe(200);
        const results = await pollQueryResults(
            admin,
            started.body.results.queryUuid,
        );
        return { fields: started.body.results.fields, rows: results.rows };
    };

    /** The same baseline, keyed by raw values only. */
    const runSourceQuery = async (
        metricQuery: Record<string, unknown>,
    ): Promise<Record<string, unknown>[]> => {
        const { rows } = await runSourceQueryWithFields(metricQuery);
        return rows.map((row) =>
            Object.fromEntries(
                Object.entries(row).map(([column, cell]) => [
                    column,
                    cell.value.raw,
                ]),
            ),
        );
    };

    // Raw numeric representation is driver-specific — Postgres stringifies
    // bigints and numerics, DuckDB (the compose engine) returns JSON
    // numbers — so the parity bar compares values, not spellings. Formatted
    // values are engine-independent and asserted elsewhere.
    const numeric = (raw: unknown) => (raw === null ? null : Number(raw));

    // The order a sorted merge promises: values in sort order, nulls where
    // the project warehouse's default puts them.
    const orderedForWarehouse = (
        values: (number | null)[],
        { descending }: { descending: boolean },
    ): (number | null)[] => {
        const nulls = values.filter((value) => value === null);
        const sorted = values
            .filter((value): value is number => value !== null)
            .sort((a, b) => (descending ? b - a : a - b));
        return getWarehouseDefaultNullsFirst(adapter, descending)
            ? [...nulls, ...sorted]
            : [...sorted, ...nulls];
    };

    // Month starts arrive spelled in different conventions depending on
    // which path truncated and serialised them — a DST month start can even
    // arrive as a date-only string of the *previous* day. Every spelling
    // sits within 24 hours before the true start, so adding a day and
    // flooring to the UTC calendar month buckets them all correctly.
    const monthOf = (raw: unknown) => {
        const slacked = new Date(
            new Date(String(raw)).getTime() + 24 * 3600_000,
        );
        return `${slacked.getUTCFullYear()}-${slacked.getUTCMonth()}`;
    };

    // The verification bar that needs no second engine: every merged value
    // must equal the value its source query returns on its own, and each
    // join type must keep exactly the key sets it promises. A merge that
    // joins wrong or drops rows fails here on whichever engine ran it.
    // A source whose filter matches nothing is an empty side, not a failed
    // merge: a left join keeps every primary row with blanks for it.
    it('keeps the other side when a source returns no rows', async () => {
        const [ordersRows, runResp] = await Promise.all([
            runSourceQuery(ordersByMonth),
            admin.post<Body<ApiExecuteAsyncMergeQueryResults>>(
                `/api/v2/projects/${projectUuid}/query/merge-query`,
                {
                    mergeQuery: {
                        ...mergeQuery,
                        sources: [
                            { id: 'orders', metricQuery: ordersByMonth },
                            {
                                id: 'payments',
                                metricQuery: {
                                    ...paymentsByMonth,
                                    filters: {
                                        dimensions: {
                                            id: 'empty',
                                            and: [
                                                {
                                                    id: 'future',
                                                    target: {
                                                        fieldId:
                                                            'orders_order_date_month',
                                                    },
                                                    operator:
                                                        'greaterThanOrEqual',
                                                    values: ['2999-01-01'],
                                                },
                                            ],
                                        },
                                    },
                                },
                            },
                        ],
                        joinType: MergeJoinType.LEFT,
                    },
                    context: QueryExecutionContext.EXPLORE,
                    mode: { type: 'interactive' },
                },
            ),
        ]);
        expect(runResp.body.results.outcome).toBe('started');
        if (runResp.body.results.outcome !== 'started') {
            throw new Error(
                `Merge was refused: ${JSON.stringify(runResp.body.results.errors)}`,
            );
        }

        const results = await pollQueryResults(
            admin,
            runResp.body.results.query.queryUuid,
        );

        expect(results.totalResults).toBe(ordersRows.length);
        results.rows.forEach((row) => {
            expect(cellOf(row, PAYMENTS_FIELD_ID).raw).toBeNull();
        });
    }, 60_000);

    it('returns exactly the values its source queries return on their own', async () => {
        const [ordersRows, paymentsRows, runResp] = await Promise.all([
            runSourceQuery(ordersByMonth),
            runSourceQuery(paymentsByMonth),
            admin.post<Body<{ queryUuid: string }>>(
                `/api/v1/projects/${projectUuid}/mergeQuery/run`,
                { mergeQuery },
            ),
        ]);
        const ordersByKey = new Map(
            ordersRows.map((row) => [
                monthOf(row.orders_order_date_month),
                row.orders_total_order_amount,
            ]),
        );
        const paymentsByKey = new Map(
            paymentsRows.map((row) => [
                monthOf(row.orders_order_date_month),
                row.payments_unique_payment_count,
            ]),
        );

        const results = await pollQueryResults(
            admin,
            runResp.body.results.queryUuid,
        );

        // FULL join: one merged row per key either source has.
        const expectedKeys = new Set([
            ...ordersByKey.keys(),
            ...paymentsByKey.keys(),
        ]);
        expect(results.totalResults).toBe(expectedKeys.size);

        results.rows.forEach((row) => {
            const key = monthOf(
                (row[KEY_FIELD_ID] as { value: { raw: unknown } }).value.raw,
            );
            const orders = (row[ORDERS_FIELD_ID] as { value: { raw: unknown } })
                .value.raw;
            const payments = (
                row[PAYMENTS_FIELD_ID] as { value: { raw: unknown } }
            ).value.raw;
            expect(numeric(orders)).toEqual(
                numeric(ordersByKey.get(key) ?? null),
            );
            expect(numeric(payments)).toEqual(
                numeric(paymentsByKey.get(key) ?? null),
            );
        });
    }, 60_000);

    // A join key need not be a selected field: the leg groups by it, so a
    // source that selects only metrics still merges at the key's grain and
    // returns the values its query returns grouped by that key.
    // Runs through the v2 route the Explorer uses: the leg the DAG submits
    // must be the widened query, or the join finds no key column in it.
    it('groups a leg by a join key its query does not select', async () => {
        const [paymentsRows, runResp] = await Promise.all([
            runSourceQuery(paymentsByMonth),
            admin.post<Body<ApiExecuteAsyncMergeQueryResults>>(
                `/api/v2/projects/${projectUuid}/query/merge-query`,
                {
                    mergeQuery: {
                        ...mergeQuery,
                        sources: [
                            { id: 'orders', metricQuery: ordersByMonth },
                            {
                                id: 'payments',
                                metricQuery: {
                                    ...paymentsByMonth,
                                    dimensions: [],
                                },
                            },
                        ],
                    },
                    context: QueryExecutionContext.EXPLORE,
                    mode: { type: 'interactive' },
                },
            ),
        ]);
        expect(runResp.body.results.outcome).toBe('started');
        if (runResp.body.results.outcome !== 'started') {
            throw new Error(
                `Merge was refused: ${JSON.stringify(runResp.body.results.errors)}`,
            );
        }
        const paymentsByKey = new Map(
            paymentsRows.map((row) => [
                monthOf(row.orders_order_date_month),
                row.payments_unique_payment_count,
            ]),
        );

        const results = await pollQueryResults(
            admin,
            runResp.body.results.query.queryUuid,
        );

        expect(results.rows.length).toBeGreaterThan(1);
        results.rows.forEach((row) => {
            const key = monthOf(cellOf(row, KEY_FIELD_ID).raw);
            expect(numeric(cellOf(row, PAYMENTS_FIELD_ID).raw)).toEqual(
                numeric(paymentsByKey.get(key) ?? null),
            );
        });
    }, 60_000);

    // A sort is a merge-level input: the legs still run whole and unsorted,
    // and the merged statement orders once, by a merged field from either
    // side. Here by the second source's metric, which the primary query
    // could never sort by on its own.
    it('orders the merged result by a second-source metric', async () => {
        const sorted = {
            ...mergeQuery,
            sorts: [
                { fieldId: PAYMENTS_FIELD_ID, descending: true },
                { fieldId: KEY_FIELD_ID, descending: false },
            ],
        };
        const compiled = await admin.post<Body<ApiCompiledMergeQueryResults>>(
            `/api/v1/projects/${projectUuid}/mergeQuery/compile`,
            { mergeQuery: sorted },
        );
        expect(compiled.status).toBe(200);
        expect(compiled.body.results.errors).toEqual([]);
        // The SQL shown is the SQL that runs: the sort sits on the merged
        // statement. A leg keeps only its compile's default ordering, never
        // the merge's, since a sorted leg under the row cap would join only
        // its top rows.
        expect(compiled.body.results.sql).toContain(
            `ORDER BY "${PAYMENTS_FIELD_ID}" DESC${nullsClause(
                adapter,
                true,
            )}, "${KEY_FIELD_ID}"${nullsClause(adapter, false)}`,
        );
        compiled.body.results.legs.forEach((leg) => {
            expect(leg.sql).not.toContain(
                'payments_unique_payment_count" DESC',
            );
        });

        const runResp = await admin.post<
            Body<ApiExecuteAsyncMergeQueryResults>
        >(`/api/v2/projects/${projectUuid}/query/merge-query`, {
            mergeQuery: sorted,
            context: QueryExecutionContext.EXPLORE,
        });
        expect(runResp.status).toBe(200);
        if (runResp.body.results.outcome !== 'started') {
            throw new Error(
                `Merge was refused: ${JSON.stringify(runResp.body.results.errors)}`,
            );
        }
        expect(runResp.body.results.query.metricQuery.sorts).toEqual(
            sorted.sorts.map((sort) => ({
                ...sort,
                nullsFirst: getWarehouseDefaultNullsFirst(
                    adapter,
                    sort.descending,
                ),
            })),
        );

        const results = await pollQueryResults(
            admin,
            runResp.body.results.query.queryUuid,
        );
        const counts = results.rows.map((row) =>
            numeric(cellOf(row, PAYMENTS_FIELD_ID).raw),
        );
        expect(new Set(counts).size).toBeGreaterThan(1);
        expect(counts).toEqual(
            orderedForWarehouse(counts, { descending: true }),
        );
    }, 60_000);

    // The join runs on the compose engine, whose default null order is not
    // every warehouse's. Under a limit that decides which rows survive, so
    // the merge states the project warehouse's placement on every sort. The
    // expectation is read from the same merge run unlimited, because each
    // warehouse's dataset carries its own share of null months.
    it('places nulls under a limit the way the project warehouse does', async () => {
        // Restrict payments to one existing order so other months are unmatched,
        // regardless of the payment-method distribution in each warehouse.
        const paymentOrders = await runSourceQuery({
            ...paymentsByMonth,
            dimensions: ['orders_order_id'],
            filters: {
                dimensions: {
                    id: 'existing-order-group',
                    and: [
                        {
                            id: 'existing-order',
                            target: { fieldId: 'orders_order_id' },
                            operator: FilterOperator.NOT_NULL,
                            values: [],
                        },
                    ],
                },
            },
            limit: 1,
        });
        expect(paymentOrders).toHaveLength(1);
        expect(paymentOrders[0].orders_order_id).not.toBeNull();
        const oneOrderPayments = {
            ...paymentsByMonth,
            filters: {
                dimensions: {
                    id: 'one-order-group',
                    and: [
                        {
                            id: 'one-order',
                            target: { fieldId: 'orders_order_id' },
                            operator: FilterOperator.EQUALS,
                            values: [paymentOrders[0].orders_order_id],
                        },
                    ],
                },
            },
        };
        const runSorted = async (limit: number) => {
            const runResp = await admin.post<
                Body<ApiExecuteAsyncMergeQueryResults>
            >(`/api/v2/projects/${projectUuid}/query/merge-query`, {
                mergeQuery: {
                    ...mergeQuery,
                    sources: [
                        { id: 'orders', metricQuery: ordersByMonth },
                        { id: 'payments', metricQuery: oneOrderPayments },
                    ],
                    sorts: [{ fieldId: PAYMENTS_FIELD_ID, descending: true }],
                    limit,
                },
                context: QueryExecutionContext.EXPLORE,
            });
            expect(runResp.status).toBe(200);
            if (runResp.body.results.outcome !== 'started') {
                throw new Error(
                    `Merge was refused: ${JSON.stringify(runResp.body.results.errors)}`,
                );
            }
            const results = await pollQueryResults(
                admin,
                runResp.body.results.query.queryUuid,
            );
            return results.rows.map((row) =>
                numeric(cellOf(row, PAYMENTS_FIELD_ID).raw),
            );
        };

        const [everyRow, limitedRows] = await Promise.all([
            runSorted(500),
            runSorted(1),
        ]);
        expect(everyRow.some((count) => count === null)).toBe(true);
        expect(everyRow.some((count) => count !== null)).toBe(true);
        expect(limitedRows).toHaveLength(1);
        // The limited run keeps the head of the unlimited run's order: the
        // null rows first or last per the warehouse, values descending.
        expect(limitedRows).toEqual(
            orderedForWarehouse(everyRow, { descending: true }).slice(
                0,
                limitedRows.length,
            ),
        );
    }, 90_000);

    // Totals for a merged result are aggregated over its rows on the compose
    // engine. Every source value appears once per key, so a sum is exact;
    // a distinct count is not, and is left out rather than approximated.
    it('totals the merged result over its rows for exact metrics only', async () => {
        const runResp = await admin.post<
            Body<ApiExecuteAsyncMergeQueryResults>
        >(`/api/v2/projects/${projectUuid}/query/merge-query`, {
            mergeQuery,
            context: QueryExecutionContext.EXPLORE,
        });
        expect(runResp.status).toBe(200);
        if (runResp.body.results.outcome !== 'started') {
            throw new Error(
                `Merge was refused: ${JSON.stringify(runResp.body.results.errors)}`,
            );
        }
        const mergedQueryUuid = runResp.body.results.query.queryUuid;
        const merged = await pollQueryResults(admin, mergedQueryUuid);
        const expectedOrdersTotal = merged.rows.reduce(
            (sum, row) =>
                sum + (numeric(cellOf(row, ORDERS_FIELD_ID).raw) ?? 0),
            0,
        );

        const started = await admin.post<
            Body<ApiExecuteAsyncMetricQueryResults>
        >(
            `/api/v2/projects/${projectUuid}/query/${mergedQueryUuid}/calculate-total`,
            { kind: 'columnTotal' },
        );
        expect(started.status).toBe(200);
        // The sum is totalled; the distinct payment count is not exact over
        // merged rows and is not offered.
        expect(Object.keys(started.body.results.fields)).toEqual([
            ORDERS_FIELD_ID,
        ]);

        const totals = await pollQueryResults(
            admin,
            started.body.results.queryUuid,
        );
        expect(totals.rows).toHaveLength(1);
        const [totalsRow] = totals.rows;
        expect(numeric(cellOf(totalsRow, ORDERS_FIELD_ID).raw)).toBeCloseTo(
            expectedOrdersTotal,
            2,
        );
        expect(totalsRow[PAYMENTS_FIELD_ID]).toBeUndefined();
    }, 90_000);

    it('applies each source filter before aggregation and merging', async () => {
        const filteredOrders = {
            ...ordersByMonth,
            filters: completedOnly,
        };
        const filteredPayments = {
            ...paymentsByMonth,
            filters: completedOnly,
        };
        const filteredMerge = {
            ...mergeQuery,
            sources: [
                { id: 'orders', metricQuery: filteredOrders },
                { id: 'payments', metricQuery: filteredPayments },
            ],
        };

        const [ordersRows, paymentsRows, runResp] = await Promise.all([
            runSourceQuery(filteredOrders),
            runSourceQuery(filteredPayments),
            admin.post<Body<{ queryUuid: string }>>(
                `/api/v1/projects/${projectUuid}/mergeQuery/run`,
                { mergeQuery: filteredMerge },
            ),
        ]);
        const ordersByKey = new Map(
            ordersRows.map((row) => [
                monthOf(row.orders_order_date_month),
                row.orders_total_order_amount,
            ]),
        );
        const paymentsByKey = new Map(
            paymentsRows.map((row) => [
                monthOf(row.orders_order_date_month),
                row.payments_unique_payment_count,
            ]),
        );
        const results = await pollQueryResults(
            admin,
            runResp.body.results.queryUuid,
        );

        expect(results.totalResults).toBe(
            new Set([...ordersByKey.keys(), ...paymentsByKey.keys()]).size,
        );
        results.rows.forEach((row) => {
            const key = monthOf(
                (row[KEY_FIELD_ID] as { value: { raw: unknown } }).value.raw,
            );
            expect(
                numeric(
                    (row[ORDERS_FIELD_ID] as { value: { raw: unknown } }).value
                        .raw,
                ),
            ).toEqual(numeric(ordersByKey.get(key) ?? null));
            expect(
                numeric(
                    (row[PAYMENTS_FIELD_ID] as { value: { raw: unknown } })
                        .value.raw,
                ),
            ).toEqual(numeric(paymentsByKey.get(key) ?? null));
        });
    }, 60_000);

    it('keeps the key sets each join type promises', async () => {
        const [ordersRows, paymentsRows] = await Promise.all([
            runSourceQuery(ordersByMonth),
            runSourceQuery(paymentsByMonth),
        ]);
        const ordersKeys = new Set(
            ordersRows.map((row) => monthOf(row.orders_order_date_month)),
        );
        const paymentsKeys = new Set(
            paymentsRows.map((row) => monthOf(row.orders_order_date_month)),
        );
        const intersection = [...ordersKeys].filter((key) =>
            paymentsKeys.has(key),
        );

        const rowCountFor = async (joinType: string) => {
            const runResp = await admin.post<Body<{ queryUuid: string }>>(
                `/api/v1/projects/${projectUuid}/mergeQuery/run`,
                { mergeQuery: { ...mergeQuery, joinType } },
            );
            const results = await pollQueryResults(
                admin,
                runResp.body.results.queryUuid,
            );
            return results.totalResults;
        };

        expect(await rowCountFor('full')).toBe(
            new Set([...ordersKeys, ...paymentsKeys]).size,
        );
        expect(await rowCountFor('left')).toBe(ordersKeys.size);
        expect(await rowCountFor('inner')).toBe(intersection.length);
    }, 90_000);

    // Result sources: an existing query result referenced by queryUuid joins
    // as the rows it already holds — nothing re-runs. The same parity bar
    // applies: merged values must equal what the referenced queries returned.
    it('merges existing query results by queryUuid', async () => {
        const startAndFetch = async (query: Record<string, unknown>) => {
            const started = await admin.post<Body<{ queryUuid: string }>>(
                `/api/v2/projects/${projectUuid}/query/metric-query`,
                { context: 'exploreView', query },
            );
            expect(started.status).toBe(200);
            const results = await pollQueryResults(
                admin,
                started.body.results.queryUuid,
            );
            return {
                queryUuid: started.body.results.queryUuid,
                rows: results.rows.map((row) =>
                    Object.fromEntries(
                        Object.entries(row).map(([column, cell]) => [
                            column,
                            (cell as { value: { raw: unknown } }).value.raw,
                        ]),
                    ),
                ),
            };
        };
        const [ordersRun, paymentsRun] = await Promise.all([
            startAndFetch(ordersByMonth),
            startAndFetch(paymentsByMonth),
        ]);

        const runResp = await admin.post<
            Body<ApiExecuteAsyncMergeQueryResults>
        >(`/api/v2/projects/${projectUuid}/query/compose-merge-query`, {
            mergeQuery: {
                ...mergeQuery,
                sources: [
                    { id: 'orders', queryUuid: ordersRun.queryUuid },
                    { id: 'payments', queryUuid: paymentsRun.queryUuid },
                ],
            },
            context: QueryExecutionContext.EXPLORE,
        });
        expect(runResp.status).toBe(200);
        if (runResp.body.results.outcome !== 'started') {
            throw new Error(
                `Expected the merge to start: ${JSON.stringify(
                    runResp.body.results.errors,
                )}`,
            );
        }

        const results = await pollQueryResults(
            admin,
            runResp.body.results.query.queryUuid,
        );
        const ordersByKey = new Map(
            ordersRun.rows.map((row) => [
                monthOf(row.orders_order_date_month),
                row.orders_total_order_amount,
            ]),
        );
        const paymentsByKey = new Map(
            paymentsRun.rows.map((row) => [
                monthOf(row.orders_order_date_month),
                row.payments_unique_payment_count,
            ]),
        );
        expect(results.totalResults).toBe(
            new Set([...ordersByKey.keys(), ...paymentsByKey.keys()]).size,
        );
        results.rows.forEach((row) => {
            const key = monthOf(
                (row[KEY_FIELD_ID] as { value: { raw: unknown } }).value.raw,
            );
            expect(
                numeric(
                    (row[ORDERS_FIELD_ID] as { value: { raw: unknown } }).value
                        .raw,
                ),
            ).toEqual(numeric(ordersByKey.get(key) ?? null));
            expect(
                numeric(
                    (row[PAYMENTS_FIELD_ID] as { value: { raw: unknown } })
                        .value.raw,
                ),
            ).toEqual(numeric(paymentsByKey.get(key) ?? null));
        });
    }, 120_000);

    it('refuses a result source that does not exist, naming the remedy', async () => {
        const runResp = await admin.post<
            Body<ApiExecuteAsyncMergeQueryResults>
        >(`/api/v2/projects/${projectUuid}/query/compose-merge-query`, {
            mergeQuery: {
                ...mergeQuery,
                sources: [
                    { id: 'orders', metricQuery: ordersByMonth },
                    {
                        id: 'payments',
                        queryUuid: '00000000-0000-4000-8000-000000000000',
                    },
                ],
            },
            context: QueryExecutionContext.EXPLORE,
        });
        expect(runResp.status).toBe(200);
        expect(runResp.body.results.outcome).toBe('refused');
        if (runResp.body.results.outcome === 'refused') {
            expect(
                runResp.body.results.errors.map((error) => error.kind),
            ).toContain(MergeQueryErrorKind.RESULT_SOURCE_UNAVAILABLE);
        }
    }, 30_000);

    // The jaffle subscriptions explore's customers join carries a Lightdash
    // parameter, so selecting orders_status through it forces the
    // parameterized join in. The single-query path refuses to run without a
    // value; the merge must refuse the same way instead of shipping a
    // literal `${ld.parameters...}` placeholder to the warehouse.
    it('refuses a missing parameter and applies a supplied value', async () => {
        const parameterized = {
            sources: [
                {
                    id: 'orders',
                    metricQuery: {
                        ...ordersByMonth,
                        dimensions: [
                            'orders_order_date_month',
                            'orders_status',
                        ],
                    },
                },
                {
                    id: 'subs',
                    metricQuery: {
                        exploreName: 'subscriptions',
                        dimensions: [
                            'subscriptions_subscription_start_month',
                            'orders_status',
                        ],
                        metrics: ['subscriptions_total_monthly_mrr'],
                        filters: {},
                        sorts: [],
                        limit: 500,
                        tableCalculations: [],
                        additionalMetrics: [],
                    },
                },
            ],
            joinKey: [
                {
                    name: 'month',
                    fieldIdBySourceId: {
                        orders: 'orders_order_date_month',
                        subs: 'subscriptions_subscription_start_month',
                    },
                },
                {
                    name: 'status',
                    fieldIdBySourceId: {
                        orders: 'orders_status',
                        subs: 'orders_status',
                    },
                },
            ],
            joinType: 'full',
            tableCalculations: [],
            limit: 500,
        };

        type CompileBody = Body<ApiCompiledMergeQueryResults>;
        const refused = await admin.post<CompileBody>(
            `/api/v1/projects/${projectUuid}/mergeQuery/compile`,
            { mergeQuery: parameterized },
        );
        expect(refused.body.results.sql).toBeNull();
        expect(refused.body.results.errors).toEqual([
            expect.objectContaining({
                kind: 'missing_parameters',
                sourceId: 'subs',
            }),
        ]);

        // A supplied value unblocks the same merge.
        const supplied = await admin.post<CompileBody>(
            `/api/v1/projects/${projectUuid}/mergeQuery/compile`,
            {
                mergeQuery: parameterized,
                parameters: { 'customers.customer_name': 'Ken' },
            },
        );
        expect(supplied.body.results.errors).toEqual([]);
        expect(supplied.body.results.sql).not.toContain('${ld.parameters');
        expect(supplied.body.results.parameterReferences).toContain(
            'customers.customer_name',
        );
        expect(supplied.body.results.usedParametersValues).toEqual(
            expect.objectContaining({ 'customers.customer_name': 'Ken' }),
        );

        // Executing reads the subscriptions model on the warehouse, which
        // only some staging datasets have built; compiling above does not.
        if (!hasSubscriptionsModel) return;

        const runResp = await admin.post<
            Body<ApiExecuteAsyncMergeQueryResults>
        >(`/api/v2/projects/${projectUuid}/query/merge-query`, {
            mergeQuery: parameterized,
            parameters: { 'customers.customer_name': 'Ken' },
            context: QueryExecutionContext.EXPLORE,
        });
        expect(runResp.body.results.outcome).toBe('started');
        expect(runResp.body.results.parameterReferences).toContain(
            'customers.customer_name',
        );
        if (runResp.body.results.outcome !== 'started') {
            throw new Error(
                `Parameterized merge was refused: ${JSON.stringify(runResp.body.results.errors)}`,
            );
        }
        expect(runResp.body.results.query.usedParametersValues).toEqual(
            expect.objectContaining({ 'customers.customer_name': 'Ken' }),
        );
        const results = await pollQueryResults(
            admin,
            runResp.body.results.query.queryUuid,
        );
        expect(results.totalResults).toBeGreaterThan(0);
    }, 60_000);

    // Widen the key with the order status, shared by both explores, so the
    // merged result can be pivoted by it.
    const ordersByMonthAndStatus = {
        ...ordersByMonth,
        dimensions: ['orders_order_date_month', 'orders_status'],
    };
    const paymentsByMonthAndStatus = {
        ...paymentsByMonth,
        dimensions: ['orders_order_date_month', 'orders_status'],
    };
    const withStatus = {
        ...mergeQuery,
        sources: [
            { id: 'orders', metricQuery: ordersByMonthAndStatus },
            { id: 'payments', metricQuery: paymentsByMonthAndStatus },
        ],
        joinKey: [
            ...mergeQuery.joinKey,
            {
                name: 'status',
                fieldIdBySourceId: {
                    orders: 'orders_status',
                    payments: 'orders_status',
                },
            },
        ],
    };
    const pivotByStatus = {
        indexColumn: { reference: KEY_FIELD_ID, type: 'time' },
        valuesColumns: [
            { reference: ORDERS_FIELD_ID, aggregation: 'any' },
            { reference: PAYMENTS_FIELD_ID, aggregation: 'any' },
        ],
        groupByColumns: [{ reference: 'merge_status' }],
        sortBy: undefined,
    };

    const monthAndStatus = (month: unknown, status: unknown) =>
        `${monthOf(month)}|${String(status)}`;
    const monthPart = (key: string) => key.slice(0, key.indexOf('|'));
    const statusPart = (key: string) => key.slice(key.indexOf('|') + 1);
    const pivotStatus = (column: PivotedValuesColumn) =>
        column.pivotValues.map(({ value }) => String(value)).join('_');

    // The (month, status) keys a join type keeps, from the standalone key
    // sets alone.
    const keptKeysFor = (
        joinType: MergeJoinType,
        ordersKeys: Set<string>,
        paymentsKeys: Set<string>,
    ): Set<string> => {
        switch (joinType) {
            case MergeJoinType.FULL:
                return new Set([...ordersKeys, ...paymentsKeys]);
            case MergeJoinType.LEFT:
                return ordersKeys;
            case MergeJoinType.INNER:
                return new Set(
                    [...ordersKeys].filter((key) => paymentsKeys.has(key)),
                );
            default:
                return assertUnreachable(joinType, 'Unknown join type');
        }
    };

    // A pivoted row carries a cell only for the combinations its month has.
    const pivotedRaw = (row: ResultRow, columnName: string): unknown =>
        row[columnName] === undefined ? null : row[columnName].value.raw;

    // Same bar as the flat merge: every pivoted cell equals the standalone
    // value for its month and status, derived from the sources, not a second merge.
    it('pivots every merged cell to the value its source returns for that month and status', async () => {
        const [ordersRows, paymentsRows] = await Promise.all([
            runSourceQuery(ordersByMonthAndStatus),
            runSourceQuery(paymentsByMonthAndStatus),
        ]);
        const ordersValues = new Map(
            ordersRows.map((row) => [
                monthAndStatus(row.orders_order_date_month, row.orders_status),
                row.orders_total_order_amount,
            ]),
        );
        const paymentsValues = new Map(
            paymentsRows.map((row) => [
                monthAndStatus(row.orders_order_date_month, row.orders_status),
                row.payments_unique_payment_count,
            ]),
        );
        const sourceValues = (referenceField: string): Map<string, unknown> => {
            if (referenceField === ORDERS_FIELD_ID) return ordersValues;
            if (referenceField === PAYMENTS_FIELD_ID) return paymentsValues;
            throw new Error(`Pivoted an unexpected field: ${referenceField}`);
        };

        for (const joinType of MERGE_JOIN_TYPES) {
            const kept = keptKeysFor(
                joinType,
                new Set(ordersValues.keys()),
                new Set(paymentsValues.keys()),
            );
            const runResp = await admin.post<Body<{ queryUuid: string }>>(
                `/api/v1/projects/${projectUuid}/mergeQuery/run`,
                {
                    mergeQuery: { ...withStatus, joinType },
                    pivotConfiguration: pivotByStatus,
                },
            );
            expect(runResp.status).toBe(200);
            const results = await pollQueryResults(
                admin,
                runResp.body.results.queryUuid,
            );
            const valuesColumns = results.pivotDetails?.valuesColumns ?? [];

            // One row per kept month, one pivoted column per kept status.
            expect(results.totalResults, `${joinType} rows`).toBe(
                new Set([...kept].map(monthPart)).size,
            );
            expect(
                new Set(valuesColumns.map(pivotStatus)),
                `${joinType} statuses`,
            ).toEqual(new Set([...kept].map(statusPart)));

            results.rows.forEach((row) => {
                const month = monthOf(cellOf(row, KEY_FIELD_ID).raw);
                valuesColumns.forEach((column) => {
                    const key = `${month}|${pivotStatus(column)}`;
                    const expected = kept.has(key)
                        ? (sourceValues(column.referenceField).get(key) ?? null)
                        : null;
                    expect(
                        numeric(pivotedRaw(row, column.pivotColumnName)),
                        `${joinType} ${column.pivotColumnName} at ${key}`,
                    ).toEqual(numeric(expected));
                });
            });
        }
    }, 180_000);

    const byMonth = (rows: Record<string, unknown>[], valueField: string) =>
        new Map(
            rows.map((row) => [
                monthOf(row.orders_order_date_month),
                row[valueField],
            ]),
        );

    const expectMergedValues = (
        rows: ResultRow[],
        ordersByKey: Map<string, unknown>,
        paymentsByKey: Map<string, unknown>,
    ) => {
        rows.forEach((row) => {
            const key = monthOf(cellOf(row, KEY_FIELD_ID).raw);
            expect(numeric(cellOf(row, ORDERS_FIELD_ID).raw)).toEqual(
                numeric(ordersByKey.get(key) ?? null),
            );
            expect(numeric(cellOf(row, PAYMENTS_FIELD_ID).raw)).toEqual(
                numeric(paymentsByKey.get(key) ?? null),
            );
        });
    };

    // A saved merge is rebuilt from the chart's query plus the stored merge
    // when the chart runs, so it must open intact and run to the source values.
    it('opens a saved merged chart and runs it to the values its sources return', async () => {
        const merge: SavedMergeQuery = {
            primarySourceId: 'orders',
            sources: [
                { id: 'orders', kind: 'chart' },
                { id: 'payments', kind: 'query', metricQuery: paymentsByMonth },
            ],
            joinKey: mergeQuery.joinKey,
            joinType: MergeJoinType.FULL,
            tableCalculations: [],
        };
        const created = await admin.post<Body<SavedChart>>(
            `/api/v1/projects/${projectUuid}/saved`,
            {
                name: uniqueName('Merged chart parity'),
                tableName: 'orders',
                metricQuery: ordersByMonth,
                chartConfig: { type: ChartType.TABLE },
                tableConfig: { columnOrder: [] },
                merge,
                dashboardUuid: null,
                spaceUuid: undefined,
            } satisfies CreateChartInSpace,
        );
        expect(created.status).toBe(200);
        const chartUuid = created.body.results.uuid;
        createdChartUuids.push(chartUuid);

        const opened = await admin.get<Body<SavedChart>>(
            `/api/v1/saved/${chartUuid}`,
        );
        expect(opened.status).toBe(200);
        expect(opened.body.results.merge).toEqual(merge);

        const [ordersRows, paymentsRows, started] = await Promise.all([
            runSourceQuery(ordersByMonth),
            runSourceQuery(paymentsByMonth),
            admin.post<Body<ApiExecuteAsyncMetricQueryResults>>(
                `/api/v2/projects/${projectUuid}/query/chart`,
                { chartUuid, context: QueryExecutionContext.CHART },
            ),
        ]);
        expect(started.status).toBe(200);
        expect(Object.keys(started.body.results.fields)).toEqual(
            expect.arrayContaining([
                KEY_FIELD_ID,
                ORDERS_FIELD_ID,
                PAYMENTS_FIELD_ID,
            ]),
        );

        const results = await pollQueryResults(
            admin,
            started.body.results.queryUuid,
        );
        const ordersByKey = byMonth(ordersRows, 'orders_total_order_amount');
        const paymentsByKey = byMonth(
            paymentsRows,
            'payments_unique_payment_count',
        );
        expect(results.totalResults).toBe(
            new Set([...ordersByKey.keys(), ...paymentsByKey.keys()]).size,
        );
        expectMergedValues(results.rows, ordersByKey, paymentsByKey);
    }, 90_000);

    // The chart's sort is the Explorer's, so it may name the primary field
    // rather than its merged column. Opening the chart maps it and the tile
    // orders the way the Explorer showed it.
    it('keeps a saved merged chart sorted by its primary metric', async () => {
        const merge: SavedMergeQuery = {
            primarySourceId: 'orders',
            sources: [
                { id: 'orders', kind: 'chart' },
                { id: 'payments', kind: 'query', metricQuery: paymentsByMonth },
            ],
            joinKey: mergeQuery.joinKey,
            joinType: MergeJoinType.FULL,
            tableCalculations: [],
        };
        const created = await admin.post<Body<SavedChart>>(
            `/api/v1/projects/${projectUuid}/saved`,
            {
                name: uniqueName('Merged chart sorted'),
                tableName: 'orders',
                metricQuery: {
                    ...ordersByMonth,
                    sorts: [
                        {
                            fieldId: 'orders_total_order_amount',
                            descending: true,
                        },
                    ],
                },
                chartConfig: { type: ChartType.TABLE },
                tableConfig: { columnOrder: [] },
                merge,
                dashboardUuid: null,
                spaceUuid: undefined,
            } satisfies CreateChartInSpace,
        );
        expect(created.status).toBe(200);
        const chartUuid = created.body.results.uuid;
        createdChartUuids.push(chartUuid);

        const started = await admin.post<
            Body<ApiExecuteAsyncMetricQueryResults>
        >(`/api/v2/projects/${projectUuid}/query/chart`, {
            chartUuid,
            context: QueryExecutionContext.CHART,
        });
        expect(started.status).toBe(200);
        expect(started.body.results.metricQuery.sorts).toEqual([
            {
                fieldId: ORDERS_FIELD_ID,
                descending: true,
                nullsFirst: getWarehouseDefaultNullsFirst(adapter, true),
            },
        ]);

        const results = await pollQueryResults(
            admin,
            started.body.results.queryUuid,
        );
        const amounts = results.rows.map((row) =>
            numeric(cellOf(row, ORDERS_FIELD_ID).raw),
        );
        expect(new Set(amounts).size).toBeGreaterThan(1);
        expect(amounts).toEqual(
            orderedForWarehouse(amounts, { descending: true }),
        );
    }, 90_000);

    // On a dashboard the merged chart is an ordinary saved_chart tile, and a
    // dashboard filter both sources have is pushed into each of them before
    // the join. The bar is the same filtered baseline the chart-filter case
    // uses: every merged value equals what its source returns with that
    // filter, and the echo says which source each filter reached.
    it('runs a merged chart as a merge on a dashboard tile, with the tile filter on both sources', async () => {
        const merge: SavedMergeQuery = {
            primarySourceId: 'orders',
            sources: [
                { id: 'orders', kind: 'chart' },
                { id: 'payments', kind: 'query', metricQuery: paymentsByMonth },
            ],
            joinKey: mergeQuery.joinKey,
            joinType: MergeJoinType.FULL,
            tableCalculations: [],
        };
        const createdChart = await admin.post<Body<SavedChart>>(
            `/api/v1/projects/${projectUuid}/saved`,
            {
                name: uniqueName('Merged chart on a dashboard'),
                tableName: 'orders',
                metricQuery: ordersByMonth,
                chartConfig: { type: ChartType.TABLE },
                tableConfig: { columnOrder: [] },
                merge,
                dashboardUuid: null,
                spaceUuid: undefined,
            } satisfies CreateChartInSpace,
        );
        expect(createdChart.status).toBe(200);
        const chartUuid = createdChart.body.results.uuid;
        createdChartUuids.push(chartUuid);

        const createdDashboard = await admin.post<Body<Dashboard>>(
            `/api/v1/projects/${projectUuid}/dashboards`,
            {
                name: uniqueName('Merged chart dashboard'),
                tiles: [
                    {
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 0,
                        w: 12,
                        h: 6,
                        tabUuid: null,
                        properties: { savedChartUuid: chartUuid },
                    },
                ],
                tabs: [],
            } satisfies CreateDashboard,
        );
        expect(createdDashboard.status).toBe(201);
        const dashboardUuid = createdDashboard.body.results.uuid;
        createdDashboardUuids.push(dashboardUuid);
        const [tile] = createdDashboard.body.results.tiles;
        expect(tile).toBeDefined();

        const [ordersRows, paymentsRows, started] = await Promise.all([
            runSourceQuery({ ...ordersByMonth, filters: completedOnly }),
            runSourceQuery({ ...paymentsByMonth, filters: completedOnly }),
            admin.post<Body<ApiExecuteAsyncDashboardChartQueryResults>>(
                `/api/v2/projects/${projectUuid}/query/dashboard-chart`,
                {
                    chartUuid,
                    tileUuid: tile.uuid,
                    dashboardUuid,
                    dashboardFilters: completedOnlyDashboardFilters,
                    dashboardSorts: [],
                    context: QueryExecutionContext.DASHBOARD,
                },
            ),
        ]);
        expect(started.status).toBe(200);
        // The tile carries the merged columns, not the primary source alone.
        expect(Object.keys(started.body.results.fields)).toEqual(
            expect.arrayContaining([
                KEY_FIELD_ID,
                ORDERS_FIELD_ID,
                PAYMENTS_FIELD_ID,
            ]),
        );
        expect(
            started.body.results.appliedDashboardFilters.dimensions.map(
                (rule) => rule.id,
            ),
        ).toEqual(['dashboard-status-filter']);
        const bySourceId =
            started.body.results.appliedDashboardFiltersBySourceId ?? {};
        expect(Object.keys(bySourceId).sort()).toEqual(['orders', 'payments']);
        Object.values(bySourceId).forEach((applied) => {
            expect(applied.dimensions.map((rule) => rule.id)).toEqual([
                'dashboard-status-filter',
            ]);
        });

        const results = await pollQueryResults(
            admin,
            started.body.results.queryUuid,
        );
        const ordersByKey = byMonth(ordersRows, 'orders_total_order_amount');
        const paymentsByKey = byMonth(
            paymentsRows,
            'payments_unique_payment_count',
        );
        expect(results.totalResults).toBe(
            new Set([...ordersByKey.keys(), ...paymentsByKey.keys()]).size,
        );
        expectMergedValues(results.rows, ordersByKey, paymentsByKey);
    }, 120_000);

    // Raw parity lets a formatting or labelling regression through: merged
    // cells and fields must format and label as the source the response names.
    it('formats merged cells and labels merged fields as their source fields', async () => {
        const [orders, payments, runResp] = await Promise.all([
            runSourceQueryWithFields(ordersByMonth),
            runSourceQueryWithFields(paymentsByMonth),
            admin.post<Body<ApiExecuteAsyncMergeQueryResults>>(
                `/api/v2/projects/${projectUuid}/query/merge-query`,
                { mergeQuery, context: QueryExecutionContext.EXPLORE },
            ),
        ]);
        expect(runResp.body.results.outcome).toBe('started');
        if (runResp.body.results.outcome !== 'started') {
            throw new Error(
                `Merge was refused: ${JSON.stringify(runResp.body.results.errors)}`,
            );
        }
        const { fieldOrigins } = runResp.body.results;
        const mergedFields = runResp.body.results.query.fields;
        const results = await pollQueryResults(
            admin,
            runResp.body.results.query.queryUuid,
        );
        expect(results.totalResults).toBeGreaterThan(0);

        [
            { fieldId: ORDERS_FIELD_ID, standalone: orders },
            { fieldId: PAYMENTS_FIELD_ID, standalone: payments },
        ].forEach(({ fieldId, standalone }) => {
            const origin = fieldOrigins[fieldId];
            if (origin === undefined || origin.kind !== 'source') {
                throw new Error(
                    `${fieldId} is not attributed to a source: ${JSON.stringify(origin)}`,
                );
            }
            const mergedField = mergedFields[fieldId];
            const sourceField = standalone.fields[origin.sourceFieldId];
            if (
                mergedField === undefined ||
                !isField(mergedField) ||
                sourceField === undefined ||
                !isField(sourceField)
            ) {
                throw new Error(
                    `${fieldId} or ${origin.sourceFieldId} is missing from its fields map`,
                );
            }
            expect(mergedField.label).toBe(sourceField.label);
            expect(mergedField.tableLabel).toBe(sourceField.tableLabel);

            const formattedByKey = new Map(
                standalone.rows.map((row) => [
                    monthOf(cellOf(row, 'orders_order_date_month').raw),
                    cellOf(row, origin.sourceFieldId).formatted,
                ]),
            );
            results.rows.forEach((row) => {
                const key = monthOf(cellOf(row, KEY_FIELD_ID).raw);
                const expected = formattedByKey.get(key);
                if (expected === undefined) {
                    expect(cellOf(row, fieldId).raw).toBeNull();
                    return;
                }
                expect(
                    cellOf(row, fieldId).formatted,
                    `${fieldId} at ${key}`,
                ).toBe(expected);
            });
        });
    }, 60_000);
}

// Databricks is excluded to avoid starting serverless compute for this suite,
// matching the pivot parity suite.
const mergeWarehouseEntries = getAvailableWarehouseConfigs({
    includePostgres: false,
    includeDatabricks: false,
});

// Staging datasets with a current build of the `subscriptions` model; see
// MergeTestContext.hasSubscriptionsModel.
const WAREHOUSES_WITH_SUBSCRIPTIONS = new Set(['snowflake']);

describe('Merge queries on the project warehouse', () => {
    // Postgres: reuse the already-seeded project (no create/refresh needed).
    describe('postgres (seed project)', () => {
        let admin: ApiClient;

        beforeAll(async () => {
            admin = await login();
        });

        registerMergeQueryTests(() => ({
            client: admin,
            projectUuid: SEED_PROJECT.project_uuid,
            hasSubscriptionsModel: true,
            adapter: SupportedDbtAdapter.POSTGRES,
        }));
    });

    // Every other credentialed warehouse: run the same suite against the
    // shared project global setup created for it. Skipped when creds are absent.
    for (const { name } of mergeWarehouseEntries) {
        // Remote warehouses drop a connection now and then ("socket hang up");
        // one retry keeps that transient from failing the run.
        describe(name, { retry: 1 }, () => {
            let admin: ApiClient;
            let projectUuid: string;

            beforeAll(async () => {
                admin = await login();
                projectUuid = await useSharedWarehouseProject(admin, name);
            }, 420_000);

            const adapter = adapterByWarehouseName[name];
            if (adapter === undefined) {
                throw new Error(`No adapter known for warehouse "${name}"`);
            }
            registerMergeQueryTests(() => ({
                client: admin,
                projectUuid,
                hasSubscriptionsModel: WAREHOUSES_WITH_SUBSCRIPTIONS.has(name),
                adapter,
            }));
        });
    }
});
