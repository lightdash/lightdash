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
    type ResultRow,
    type UserAttribute,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login, loginAsViewer, loginWithPermissions } from '../helpers/auth';

// A composer chart is a saved chart whose query is a pipeline: here a
// semantic-layer node with a hand-authored custom metric, reshaped by a DuckDB
// node. A dashboard viewer runs it through the ordinary saved-chart endpoints
// without holding the authoring permissions for either node, and every value
// must equal what the semantic node returns on its own.
const projectUuid = SEED_PROJECT.project_uuid;
const COMPOSE_FLAG = 'compose-sql-runner';
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
    let flagWasEnabled: boolean;
    let cacheWasEnabled: boolean;

    const pollQuery = async (
        client: ApiClient,
        queryUuid: string,
        maxRetries = 120,
    ): Promise<QueryResultsBody['results']> => {
        // eslint-disable-next-line no-plusplus
        for (let i = 0; i < maxRetries; i++) {
            const resp = await client.get<QueryResultsBody>(
                `/api/v2/projects/${projectUuid}/query/${queryUuid}`,
            );
            const { status } = resp.body.results;
            if (status === 'ready' || status === 'error') {
                return resp.body.results;
            }
            await new Promise((resolve) => {
                setTimeout(resolve, 500);
            });
        }
        throw new Error(`Query ${queryUuid} did not finish`);
    };

    const pollQueryResults = async (
        client: ApiClient,
        queryUuid: string,
    ): Promise<QueryResultsBody['results']> => {
        const results = await pollQuery(client, queryUuid);
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
    });

    afterAll(async () => {
        if (!flagWasEnabled) {
            await admin.post(`/api/v2/feature-flag/${COMPOSE_FLAG}`, {
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
        ['results', {}],
        [
            'chart-and-results',
            { dashboardSorts: [], dashboardFilters: {}, dashboardUuid: '' },
        ],
        ['calculate-total', {}],
    ])(
        'the classic-only route %s refuses the chart by name',
        async (route, body) => {
            const resp = await viewer.post<ApiErrorBody>(
                `/api/v1/saved/${revenueShareTile.chartUuid}/${route}`,
                'dashboardUuid' in body ? { ...body, dashboardUuid } : body,
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(400);
            expect(resp.body.error.name).toBe('ComposerChartNotSupportedError');
        },
    );
});
