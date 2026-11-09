import {
    isDashboardChartTileType,
    MetricType,
    QueryExecutionContext,
    SEED_COMPOSER_CHART,
    SEED_COMPOSER_CHART_DASHBOARD,
    SEED_ORG_1_VIEWER,
    SEED_PROJECT,
    type ApiExecuteAsyncComposerChartQueryResults,
    type ApiExecuteAsyncMetricQueryResults,
    type Dashboard,
    type FeatureFlag,
    type QueryHistoryListItem,
    type ResultRow,
    type UserAttribute,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login, loginAsViewer, loginWithPermissions } from '../helpers/auth';
import { pollUntil } from '../helpers/polling';

// A viewer runs a composer chart (semantic node with custom SQL, reshaped by a
// DuckDB node) without authoring rights; values must match the semantic node.
const projectUuid = SEED_PROJECT.project_uuid;
const COMPOSE_FLAG = 'compose-sql-runner';
const QUERY_HISTORY_FLAG = 'query-history';
const CLASSIC_CHART_NAME = 'How much revenue do we have per payment method?';
const resultsCacheUrl = `/api/v1/projects/${projectUuid}/results-cache-config`;

const fieldReference = (id: string) => `\${${id}}`;

/** The revenue-share chart's semantic node, as the fixture stores it. */
const ordersNodeQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_total_order_amount', 'orders_amount_x2'],
    additionalMetrics: [
        {
            name: 'amount_x2',
            label: 'Amount x2',
            table: 'orders',
            type: MetricType.SUM,
            sql: `${fieldReference('TABLE')}.amount * 2`,
            baseDimensionName: 'amount',
        },
    ],
    filters: {},
    sorts: [{ fieldId: 'orders_status', descending: false }],
    limit: 500,
    tableCalculations: [],
};

type QueryResultsBody = Body<{
    status: string;
    rows: ResultRow[];
    totalResults: number;
    error?: string | null;
}>;

type ApiErrorBody = { error: { name: string; message: string } };

type Tile = { tileUuid: string; chartUuid: string };

const numeric = (raw: unknown): number => Number(raw);

const rawRows = (rows: ResultRow[]): Record<string, unknown>[] =>
    rows.map((row) =>
        Object.fromEntries(
            Object.entries(row).map(([column, cell]) => [
                column,
                cell.value.raw,
            ]),
        ),
    );

describe('Composer chart run as a dashboard viewer', () => {
    let admin: ApiClient;
    let viewer: ApiClient;
    let dashboardUuid: string;
    let revenueShareTile: Tile;
    let customersByAgeTile: Tile;
    let revenueAndCustomersTile: Tile;
    let flagWasEnabled: boolean;
    let historyFlagWasEnabled: boolean;
    let cacheWasEnabled: boolean;

    const pollQueryResults = async (
        client: ApiClient,
        queryUuid: string,
    ): Promise<QueryResultsBody['results']> => {
        const { results } = await pollUntil<QueryResultsBody>(
            client,
            `/api/v2/projects/${projectUuid}/query/${queryUuid}`,
            {
                timeout: 60_000,
                interval: 500,
                condition: (body) =>
                    body.results.status === 'ready' ||
                    body.results.status === 'error',
            },
        );
        if (results.status === 'error') {
            throw new Error(`Query failed: ${JSON.stringify(results)}`);
        }
        return results;
    };

    const tileRequest = (tile: Tile, extra: Record<string, unknown> = {}) => ({
        ...tile,
        dashboardUuid,
        dashboardFilters: {
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        },
        dashboardSorts: [],
        context: QueryExecutionContext.DASHBOARD,
        ...extra,
    });

    const runTile = (client: ApiClient, tile: Tile) =>
        client.post<Body<ApiExecuteAsyncComposerChartQueryResults>>(
            `/api/v2/projects/${projectUuid}/query/dashboard-chart`,
            tileRequest(tile),
        );

    const runChart = (client: ApiClient, chartUuid: string) =>
        client.post<Body<ApiExecuteAsyncComposerChartQueryResults>>(
            `/api/v2/projects/${projectUuid}/query/chart`,
            { chartUuid, context: QueryExecutionContext.CHART },
        );

    const historyUrl = `/api/v2/projects/${projectUuid}/query/history?pageSize=100`;
    type HistoryBody = Body<{ data: QueryHistoryListItem[] }>;

    /** The caller's own history, newest first. */
    const listHistory = async (
        client: ApiClient,
    ): Promise<QueryHistoryListItem[]> => {
        const resp = await client.get<HistoryBody>(historyUrl);
        expect(resp.status).toBe(200);
        return resp.body.results.data;
    };

    const runMetricQuery = (client: ApiClient, query: unknown) =>
        client.post<Body<ApiExecuteAsyncMetricQueryResults> & ApiErrorBody>(
            `/api/v2/projects/${projectUuid}/query/metric-query`,
            { context: QueryExecutionContext.EXPLORE, query },
            { failOnStatusCode: false },
        );

    beforeAll(async () => {
        admin = await login();
        viewer = await loginAsViewer();

        const flag = await admin.get<Body<FeatureFlag>>(
            `/api/v2/feature-flag/${COMPOSE_FLAG}`,
        );
        expect(flag.status).toBe(200);
        flagWasEnabled = flag.body.results.enabled;
        if (!flagWasEnabled) {
            const enabled = await admin.post(
                `/api/v2/feature-flag/${COMPOSE_FLAG}`,
                { enabled: true },
            );
            expect(enabled.status).toBe(200);
        }

        const historyFlag = await admin.get<Body<FeatureFlag>>(
            `/api/v2/feature-flag/${QUERY_HISTORY_FLAG}`,
        );
        expect(historyFlag.status).toBe(200);
        historyFlagWasEnabled = historyFlag.body.results.enabled;
        if (!historyFlagWasEnabled) {
            const enabled = await admin.post(
                `/api/v2/feature-flag/${QUERY_HISTORY_FLAG}`,
                { enabled: true },
            );
            expect(enabled.status).toBe(200);
        }

        const cache =
            await admin.get<Body<{ cacheEnabled: boolean }>>(resultsCacheUrl);
        cacheWasEnabled = cache.body.results.cacheEnabled;
        if (!cacheWasEnabled) {
            await admin.patch(resultsCacheUrl, { cacheEnabled: true });
        }

        const dashboard = await admin.get<Body<Dashboard>>(
            `/api/v1/dashboards/${SEED_COMPOSER_CHART_DASHBOARD.slug}?projectUuid=${projectUuid}`,
        );
        expect(dashboard.status).toBe(200);
        dashboardUuid = dashboard.body.results.uuid;
        const tileFor = (chartName: string): Tile => {
            const tile = dashboard.body.results.tiles.find(
                (candidate) =>
                    isDashboardChartTileType(candidate) &&
                    candidate.properties.chartName === chartName,
            );
            if (!tile || !isDashboardChartTileType(tile)) {
                throw new Error(`No tile for "${chartName}"`);
            }
            return {
                tileUuid: tile.uuid,
                chartUuid: tile.properties.savedChartUuid!,
            };
        };
        revenueShareTile = tileFor(SEED_COMPOSER_CHART.revenueShare);
        customersByAgeTile = tileFor(SEED_COMPOSER_CHART.customersByAge);
        revenueAndCustomersTile = tileFor(
            SEED_COMPOSER_CHART.revenueAndCustomers,
        );
    });

    afterAll(async () => {
        if (!flagWasEnabled) {
            await admin.post(`/api/v2/feature-flag/${COMPOSE_FLAG}`, {
                enabled: false,
            });
        }
        if (!historyFlagWasEnabled) {
            await admin.post(`/api/v2/feature-flag/${QUERY_HISTORY_FLAG}`, {
                enabled: false,
            });
        }
        if (!cacheWasEnabled) {
            await admin.patch(resultsCacheUrl, { cacheEnabled: false });
        }
    });

    it('runs a composer chart tile as a viewer and returns the values its semantic node returns', async () => {
        const [ordersStarted, started] = await Promise.all([
            runMetricQuery(admin, ordersNodeQuery),
            runTile(viewer, revenueShareTile),
        ]);
        expect(ordersStarted.status).toBe(200);
        expect(started.status).toBe(200);
        expect(started.body.results.queryType).toBe('composer');
        expect(started.body.results.terminalNodeId).toBe('revenue_share');
        expect(started.body.results.nodes.map(({ nodeId }) => nodeId)).toEqual([
            'orders',
            'revenue_share',
        ]);
        expect(started.body.results.chartVisualization.chartConfig.type).toBe(
            'cartesian',
        );

        const [ordersResults, results] = await Promise.all([
            pollQueryResults(admin, ordersStarted.body.results.queryUuid),
            pollQueryResults(viewer, started.body.results.queryUuid),
        ]);
        const ordersRows = rawRows(ordersResults.rows);
        const total = ordersRows.reduce(
            (sum, row) => sum + numeric(row.orders_total_order_amount),
            0,
        );
        expect(ordersRows.length).toBeGreaterThan(1);
        expect(results.totalResults).toBe(ordersRows.length);
        const composerRows = rawRows(results.rows);
        // DuckDB and the warehouse collate the status differently; match by key.
        ordersRows.forEach((expected) => {
            const row = composerRows.find(
                (candidate) =>
                    candidate.orders_status === expected.orders_status,
            );
            if (!row) throw new Error(`No row for ${expected.orders_status}`);
            expect(numeric(row.orders_total_order_amount)).toBeCloseTo(
                numeric(expected.orders_total_order_amount),
                2,
            );
            expect(numeric(row.orders_amount_x2)).toBeCloseTo(
                numeric(expected.orders_total_order_amount) * 2,
                2,
            );
            expect(numeric(row.revenue_share)).toBeCloseTo(
                numeric(expected.orders_total_order_amount) / total,
                6,
            );
        });
    }, 90_000);

    it('ignores the dashboard draft flag: a composer chart has no draft overlay', async () => {
        const started = await viewer.post<
            Body<ApiExecuteAsyncComposerChartQueryResults>
        >(
            `/api/v2/projects/${projectUuid}/query/dashboard-chart`,
            tileRequest(revenueShareTile, { includeUnpublishedDraft: true }),
        );
        expect(started.status).toBe(200);
        expect(started.body.results.queryType).toBe('composer');
    });

    it('runs the chart through the saved-chart path too', async () => {
        const started = await runChart(viewer, revenueShareTile.chartUuid);
        expect(started.status).toBe(200);
        expect(started.body.results.queryType).toBe('composer');
        const results = await pollQueryResults(
            viewer,
            started.body.results.queryUuid,
        );
        expect(results.totalResults).toBeGreaterThan(1);
    }, 60_000);

    it('serves a repeat run of the semantic node from the results cache', async () => {
        const first = await runTile(viewer, revenueShareTile);
        await pollQueryResults(viewer, first.body.results.queryUuid);
        const second = await runTile(viewer, revenueShareTile);
        const ordersNode = second.body.results.nodes.find(
            ({ nodeId }) => nodeId === 'orders',
        );
        expect(ordersNode?.cacheHit).toBe(true);
        const results = await pollQueryResults(
            viewer,
            second.body.results.queryUuid,
        );
        expect(results.totalResults).toBeGreaterThan(1);
    }, 60_000);

    it('trusts the custom SQL only as the stored node: the same query run directly is refused', async () => {
        const { client: interactiveViewer } = await loginWithPermissions(
            'interactive_viewer',
            [],
        );
        const [asViewer, asInteractiveViewer] = await Promise.all([
            runMetricQuery(viewer, ordersNodeQuery),
            runMetricQuery(interactiveViewer, ordersNodeQuery),
        ]);
        expect(asViewer.status).toBe(403);
        expect(asInteractiveViewer.status).toBe(403);

        const viaChart = await runTile(interactiveViewer, revenueShareTile);
        expect(viaChart.status).toBe(200);
        await pollQueryResults(
            interactiveViewer,
            viaChart.body.results.queryUuid,
        );
    }, 60_000);

    describe('user attributes still apply to each node', () => {
        let isAdminAttribute: UserAttribute;

        const putAttribute = (users: UserAttribute['users']) =>
            admin.put(`/api/v1/org/attributes/${isAdminAttribute.uuid}`, {
                name: isAdminAttribute.name,
                description: isAdminAttribute.description,
                attributeDefaults: isAdminAttribute.attributeDefaults,
                users: users.map(({ userUuid, values }) => ({
                    userUuid,
                    values,
                })),
                groups: isAdminAttribute.groups.map(
                    ({ groupUuid, values }) => ({ groupUuid, values }),
                ),
            });

        beforeAll(async () => {
            const attributes = await admin.get<Body<UserAttribute[]>>(
                '/api/v1/org/attributes',
            );
            const found = attributes.body.results.find(
                ({ name }) => name === 'is_admin',
            );
            if (!found) throw new Error('No is_admin attribute seeded');
            isAdminAttribute = found;
        });

        afterAll(async () => {
            await putAttribute(isAdminAttribute.users);
        });

        it('refuses the node while the viewer lacks the attribute its dimension requires', async () => {
            const started = await viewer.post<ApiErrorBody>(
                `/api/v2/projects/${projectUuid}/query/dashboard-chart`,
                tileRequest(customersByAgeTile),
                { failOnStatusCode: false },
            );
            expect(started.status).toBe(401);
            expect(started.body.error.name).toBe('AuthorizationError');
        });

        it('refuses the whole run before any node executes: the permitted node leaves no history row', async () => {
            const before = (await listHistory(viewer)).map(
                ({ queryUuid }) => queryUuid,
            );

            const viaTile = await viewer.post<ApiErrorBody>(
                `/api/v2/projects/${projectUuid}/query/dashboard-chart`,
                tileRequest(revenueAndCustomersTile, { invalidateCache: true }),
                { failOnStatusCode: false },
            );
            const viaChart = await viewer.post<ApiErrorBody>(
                `/api/v2/projects/${projectUuid}/query/chart`,
                {
                    chartUuid: revenueAndCustomersTile.chartUuid,
                    context: QueryExecutionContext.CHART,
                    invalidateCache: true,
                },
                { failOnStatusCode: false },
            );
            for (const refused of [viaTile, viaChart]) {
                expect(refused.status).toBe(401);
                expect(refused.body.error.name).toBe('AuthorizationError');
            }

            const after = (await listHistory(viewer)).map(
                ({ queryUuid }) => queryUuid,
            );
            expect(after).toEqual(before);
        });

        it('runs once the viewer holds the attribute', async () => {
            const granted = await putAttribute([
                ...isAdminAttribute.users.filter(
                    ({ userUuid }) => userUuid !== SEED_ORG_1_VIEWER.user_uuid,
                ),
                {
                    userUuid: SEED_ORG_1_VIEWER.user_uuid,
                    email: '',
                    values: ['true'],
                    value: 'true',
                },
            ]);
            expect(granted.status).toBe(201);

            const started = await runTile(viewer, customersByAgeTile);
            expect(started.status).toBe(200);
            const results = await pollQueryResults(
                viewer,
                started.body.results.queryUuid,
            );
            expect(results.totalResults).toBeGreaterThan(0);
            expect(Object.keys(results.rows[0])).toEqual([
                'customers_age',
                'customers_unique_customer_count',
            ]);
        }, 60_000);
    });

    it('refuses a run-time limit by name instead of reshaping the pipeline', async () => {
        const resp = await viewer.post<ApiErrorBody>(
            `/api/v2/projects/${projectUuid}/query/dashboard-chart`,
            tileRequest(revenueShareTile, { limit: 10 }),
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(400);
        expect(resp.body.error.message).toContain('limit');
    });

    it.each([
        [
            'dashboard-chart',
            () => ({
                url: `/api/v2/projects/${projectUuid}/query/dashboard-chart`,
                body: tileRequest(revenueShareTile, {
                    context:
                        QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION,
                }),
            }),
        ],
        [
            'chart',
            () => ({
                url: `/api/v2/projects/${projectUuid}/query/chart`,
                body: {
                    chartUuid: revenueShareTile.chartUuid,
                    context:
                        QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION,
                },
            }),
        ],
    ])(
        'refuses the internal materialization context by name on %s: it would drop the model required filters',
        async (_route, request) => {
            const { url, body } = request();
            const resp = await viewer.post<ApiErrorBody>(url, body, {
                failOnStatusCode: false,
            });
            expect(resp.status).toBe(400);
            expect(resp.body.error.name).toBe('ParameterError');
            expect(resp.body.error.message).toContain(
                QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION,
            );
        },
    );

    describe('query history shows node SQL only with SQL runner access', () => {
        let classicQueryUuid: string;

        const historyRows = async (
            client: ApiClient,
            queryUuids: string[],
        ): Promise<QueryHistoryListItem[]> => {
            const rows = (await listHistory(client)).filter((row) =>
                queryUuids.includes(row.queryUuid),
            );
            expect(rows.map(({ queryUuid }) => queryUuid).sort()).toEqual(
                [...queryUuids].sort(),
            );
            return rows;
        };

        const nodeSql = (row: QueryHistoryListItem): string | null =>
            'sql' in row.requestParameters ? row.requestParameters.sql : null;

        const runTileAndListNodeRows = async (client: ApiClient) => {
            const started = await runTile(client, revenueShareTile);
            expect(started.status).toBe(200);
            await pollQueryResults(client, started.body.results.queryUuid);
            const { nodes, terminalNodeId } = started.body.results;
            const rows = await historyRows(
                client,
                nodes.map(({ queryUuid }) => queryUuid),
            );
            const terminalQueryUuid = nodes.find(
                ({ nodeId }) => nodeId === terminalNodeId,
            )!.queryUuid;
            const duckdbRow = rows.find(
                ({ queryUuid }) => queryUuid === terminalQueryUuid,
            )!;
            const semanticRow = rows.find(
                ({ queryUuid }) => queryUuid !== terminalQueryUuid,
            )!;
            return { duckdbRow, semanticRow };
        };

        it('a viewer sees the node rows without compiled SQL, node SQL or an SQL subline', async () => {
            const { duckdbRow, semanticRow } =
                await runTileAndListNodeRows(viewer);
            expect(duckdbRow.compiledSql).toBe('');
            expect(nodeSql(duckdbRow)).toBe('');
            expect(duckdbRow.title).toBe('SQL query');
            expect(duckdbRow.subline).not.toMatch(/select/i);
            expect(semanticRow.compiledSql).toBe('');
            expect(nodeSql(semanticRow)).toBeNull();
            expect(semanticRow.exploreName).toBe('orders');
        }, 60_000);

        it('a user with SQL runner access sees the node SQL', async () => {
            const { duckdbRow, semanticRow } =
                await runTileAndListNodeRows(admin);
            expect(duckdbRow.compiledSql).toMatch(/select/i);
            expect(nodeSql(duckdbRow)).toMatch(/revenue_share/);
            expect(semanticRow.compiledSql).toMatch(/select/i);
        }, 60_000);

        it('a classic chart run keeps its compiled SQL for the viewer', async () => {
            const charts = await viewer.get<
                Body<{ uuid: string; name: string }[]>
            >(`/api/v1/projects/${projectUuid}/charts`);
            expect(charts.status).toBe(200);
            const classic = charts.body.results.find(
                ({ name }) => name === CLASSIC_CHART_NAME,
            );
            if (!classic) throw new Error(`No chart "${CLASSIC_CHART_NAME}"`);
            const started = await viewer.post<
                Body<ApiExecuteAsyncMetricQueryResults>
            >(`/api/v2/projects/${projectUuid}/query/chart`, {
                chartUuid: classic.uuid,
                context: QueryExecutionContext.CHART,
            });
            expect(started.status).toBe(200);
            classicQueryUuid = started.body.results.queryUuid;
            await pollQueryResults(viewer, classicQueryUuid);
            const [row] = await historyRows(viewer, [classicQueryUuid]);
            expect(row.compiledSql).toMatch(/select/i);
            expect(row.chartName).toBe(CLASSIC_CHART_NAME);
        }, 60_000);

        it('a totals query over a semantic node row is hidden from the viewer too', async () => {
            const started = await runTile(viewer, revenueShareTile);
            await pollQueryResults(viewer, started.body.results.queryUuid);
            const ordersNode = started.body.results.nodes.find(
                ({ nodeId }) => nodeId === 'orders',
            )!;
            const totals = await viewer.post<
                Body<ApiExecuteAsyncMetricQueryResults>
            >(
                `/api/v2/projects/${projectUuid}/query/${ordersNode.queryUuid}/calculate-total`,
                { kind: 'grandTotal' },
            );
            expect(totals.status).toBe(200);
            await pollQueryResults(viewer, totals.body.results.queryUuid);
            const [row] = await historyRows(viewer, [
                totals.body.results.queryUuid,
            ]);
            expect(row.compiledSql).toBe('');
        }, 60_000);

        it('history search cannot probe node SQL without SQL runner access', async () => {
            const searchUuids = async (client: ApiClient, term: string) => {
                const resp = await client.get<HistoryBody>(
                    `${historyUrl}&search=${encodeURIComponent(term)}`,
                );
                expect(resp.status).toBe(200);
                return resp.body.results.data.map(({ queryUuid }) => queryUuid);
            };
            // Only the DuckDB node's SQL names revenue_share
            const [asViewer, asAdmin] = await Promise.all([
                runTileAndListNodeRows(viewer),
                runTileAndListNodeRows(admin),
            ]);
            expect(await searchUuids(viewer, 'revenue_share')).not.toContain(
                asViewer.duckdbRow.queryUuid,
            );
            expect(await searchUuids(admin, 'revenue_share')).toContain(
                asAdmin.duckdbRow.queryUuid,
            );
            // The viewer's classic chart row stays searchable by its SQL
            expect(
                await searchUuids(viewer, 'payments_payment_method'),
            ).toContain(classicQueryUuid);
        }, 90_000);

        it('underlying data over a node row is refused by name', async () => {
            const { client: interactiveViewer } = await loginWithPermissions(
                'interactive_viewer',
                [],
            );
            const started = await runTile(interactiveViewer, revenueShareTile);
            expect(started.status).toBe(200);
            await pollQueryResults(
                interactiveViewer,
                started.body.results.queryUuid,
            );
            const ordersNode = started.body.results.nodes.find(
                ({ nodeId }) => nodeId === 'orders',
            )!;
            const resp = await interactiveViewer.post<ApiErrorBody>(
                `/api/v2/projects/${projectUuid}/query/underlying-data`,
                {
                    underlyingDataSourceQueryUuid: ordersNode.queryUuid,
                    filters: {},
                    context: QueryExecutionContext.VIEW_UNDERLYING_DATA,
                },
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(400);
            expect(resp.body.error.name).toBe('NotSupportedError');
            expect(resp.body.error.message).toContain('composer chart');
        }, 60_000);
    });

    it.each([
        ['results', () => ({})],
        [
            'chart-and-results',
            () => ({ dashboardSorts: [], dashboardFilters: {}, dashboardUuid }),
        ],
        ['calculate-total', () => ({})],
    ])(
        'the classic-only route %s refuses the chart by name',
        async (route, body) => {
            const resp = await viewer.post<ApiErrorBody>(
                `/api/v1/saved/${revenueShareTile.chartUuid}/${route}`,
                body(),
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(400);
            expect(resp.body.error.name).toBe('ComposerChartNotSupportedError');
        },
    );
});
