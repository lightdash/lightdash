import {
    ChartKind,
    ChartSourceType,
    ChartType,
    ContentType,
    DashboardTileTypes,
    FeatureFlags,
    FieldType,
    FilterOperator,
    getContentAsCodePathFromLtreePath,
    MergeJoinType,
    QuerySourceType,
    SearchItemType,
    SEED_DATA_APP_VIZ,
    SEED_ORG_1_EDITOR,
    SEED_PROJECT,
    ServiceAccountScope,
    type ApiDeletedContentResponse,
    type ComposerChart,
    type ComposerChartAsCode,
    type ComposerChartDashboard,
    type ComposerChartParameters,
    type ComposerChartPipeline,
    type ComposerChartRunResults,
    type ComposerChartWithDetails,
    type ContentBulkDeleteResults,
    type CreateComposerChart,
    type Dashboard,
    type DashboardAsCode,
    type DashboardComposerChartRunRequest,
    type DashboardFieldTarget,
    type ExecuteComposerChartRequest,
    type QueryHistoryListItem,
    type SearchResults,
    type Space,
    type SpaceDeleteImpact,
    type SummaryContent,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, type Body } from '../helpers/api-client';
import {
    anotherLogin,
    login,
    loginAsEditor,
    loginAsViewer,
} from '../helpers/auth';
import {
    apiClientSend,
    composerChartBody,
    composerSpaceChartBody,
    composerTile as composerTileFor,
    createComposerDashboard,
    createComposerSpaceChart,
} from '../helpers/composerDashboard';
import { mcpText, openMcpSession, personalAccessTokens } from '../helpers/mcp';
import { chartMock } from '../helpers/mocks';
import { TestResourceTracker, uniqueName } from '../helpers/test-isolation';

const projectUuid = SEED_PROJECT.project_uuid;
const chartsUrl = `/api/v2/projects/${projectUuid}/composer-charts`;
const flagUrl = `/api/v2/feature-flag/${FeatureFlags.ComposerCharts}`;

const tileRunUrl = `/api/v2/projects/${projectUuid}/query/dashboard-composer-chart`;
const chartRunUrl = `/api/v2/projects/${projectUuid}/query/composer-chart`;

const runRequest = (
    composerChartUuid: string,
    dashboardUuid: string,
    tileUuid: string,
): DashboardComposerChartRunRequest => ({
    composerChartUuid,
    dashboardUuid,
    tileUuid,
    dashboardFilters: { dimensions: [], metrics: [], tableCalculations: [] },
    parameters: {},
    excludedParameterKeys: [],
    invalidateCache: false,
});

// One node of every kind a viewer may not write themselves, except python,
// whose sandbox previews do not run
const everyKindPipeline: ComposerChartPipeline = {
    schemaVersion: 1,
    terminalNodeId: 'summary',
    nodes: [
        {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId: 'amounts',
            title: 'Amounts',
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_total_order_amount'],
        },
        {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            nodeId: 'counts',
            title: 'Counts',
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_unique_order_count'],
        },
        {
            sourceType: QuerySourceType.MERGE,
            nodeId: 'merged',
            title: 'Merged',
            sources: [{ nodeId: 'amounts' }, { nodeId: 'counts' }],
            joinKey: [
                {
                    name: 'status',
                    fieldIdBySourceId: {
                        amounts: 'orders_status',
                        counts: 'orders_status',
                    },
                },
            ],
            joinType: MergeJoinType.FULL,
        },
        {
            sourceType: QuerySourceType.SQL,
            nodeId: 'raw',
            title: 'Raw orders',
            sql: 'SELECT status, amount FROM postgres.jaffle.orders',
        },
        {
            sourceType: QuerySourceType.DUCKDB,
            nodeId: 'summary',
            title: 'Summary',
            sql: 'SELECT raw.status, count(*) AS n FROM raw JOIN merged ON raw.status = merged.merge_status GROUP BY 1',
            references: ['raw', 'merged'],
        },
    ],
};

const sqlPipeline: CreateComposerChart['pipeline'] = {
    schemaVersion: 1,
    terminalNodeId: 'orders',
    nodes: [
        {
            sourceType: QuerySourceType.SQL,
            nodeId: 'orders',
            title: 'Orders by status',
            sql: 'select status as orders_status, sum(amount) as orders_total_order_amount from orders group by 1',
        },
    ],
};

describe('Composer charts', () => {
    const tracker = new TestResourceTracker();
    let admin: ApiClient;
    let clearFlag = false;

    const createDashboard = async () => {
        const resp = await admin.post<Body<Dashboard>>(
            `/api/v1/projects/${projectUuid}/dashboards`,
            { name: uniqueName('Composer dashboard'), tiles: [], tabs: [] },
        );
        expect(resp.status).toBe(201);
        tracker.trackDashboard(resp.body.results.uuid);
        return resp.body.results;
    };

    const createChart = async (dashboardUuid: string) => {
        const resp = await admin.post<Body<ComposerChart>>(
            chartsUrl,
            composerChartBody(dashboardUuid),
        );
        expect(resp.status).toBe(201);
        return resp.body.results;
    };

    const saveTiles = (
        dashboard: Dashboard,
        tiles: Dashboard['tiles'],
        client: ApiClient = admin,
    ) =>
        client.patch<Body<Dashboard>>(`/api/v1/dashboards/${dashboard.uuid}`, {
            tiles,
            filters: dashboard.filters,
            tabs: dashboard.tabs,
        });

    const getChart = (uuid: string) =>
        admin.get<Body<ComposerChart>>(`${chartsUrl}/${uuid}`, {
            failOnStatusCode: false,
        });

    const getDashboard = async (uuid: string) =>
        (await admin.get<Body<Dashboard>>(`/api/v1/dashboards/${uuid}`)).body
            .results;

    const composerChartUuidsOn = (dashboard: Dashboard) =>
        dashboard.tiles.flatMap((tile) =>
            tile.type === DashboardTileTypes.COMPOSER_CHART
                ? [tile.properties.composerChartUuid]
                : [],
        );

    const duplicate = async (dashboard: Dashboard, client = admin) => {
        const resp = await client.post<Body<Dashboard>>(
            `/api/v1/projects/${projectUuid}/dashboards?duplicateFrom=${dashboard.uuid}`,
            { dashboardName: uniqueName('Copy'), dashboardDesc: '' },
        );
        expect(resp.status).toBe(201);
        tracker.trackDashboard(resp.body.results.uuid);
        return resp.body.results;
    };

    const addComposerTile = (dashboard: Dashboard, composerChartUuid: string) =>
        admin.patch<Body<Dashboard>>(
            `/api/v1/dashboards/${dashboard.uuid}`,
            {
                tiles: [composerTileFor(composerChartUuid)],
                filters: dashboard.filters,
                tabs: dashboard.tabs,
            },
            { failOnStatusCode: false },
        );

    const createDashboardWithSqlChart = async () => {
        const created = await createComposerDashboard(apiClientSend(admin), {
            pipeline: sqlPipeline,
        });
        tracker.trackDashboard(created.dashboard.uuid);
        return created;
    };

    const deprecatedRunUrl = (composerChartUuid: string) =>
        `${chartsUrl}/${composerChartUuid}/run`;

    const createRunnableDashboard = async () => {
        const created = await createComposerDashboard(apiClientSend(admin), {
            pipeline: everyKindPipeline,
        });
        tracker.trackDashboard(created.dashboard.uuid);
        return { ...created, tileUuid: created.dashboard.tiles[0].uuid };
    };

    const pollRows = async (client: ApiClient, queryUuid: string) => {
        for (let attempt = 0; attempt < 120; attempt += 1) {
            const resp = await client.get<
                Body<{ status: string; rows: unknown[]; error?: string }>
            >(`/api/v2/projects/${projectUuid}/query/${queryUuid}`);
            const { status } = resp.body.results;
            if (status === 'ready') return resp.body.results.rows;
            if (status === 'error') {
                throw new Error(
                    `Node query failed: ${resp.body.results.error}`,
                );
            }
            await new Promise((resolve) => {
                setTimeout(resolve, 500);
            });
        }
        throw new Error(`Node query ${queryUuid} did not complete`);
    };

    beforeAll(async () => {
        admin = await login();
        const flag = await admin.get<Body<{ enabled: boolean }>>(flagUrl);
        if (!flag.body.results.enabled) {
            expect((await admin.post(flagUrl, { enabled: true })).status).toBe(
                200,
            );
            clearFlag = true;
        }
    });

    afterAll(async () => {
        await tracker.cleanup(admin);
        if (clearFlag) expect((await admin.delete(flagUrl)).status).toBe(200);
    });

    it('saves a chart onto a dashboard', async () => {
        const { dashboard, chart } = await createComposerDashboard(
            apiClientSend(admin),
        );
        tracker.trackDashboard(dashboard.uuid);
        expect(chart).toMatchObject({
            projectUuid,
            owner: { type: 'dashboard', dashboardUuid: dashboard.uuid },
            name: 'Orders by status',
            slug: expect.stringMatching(/^orders-by-status/),
            pipeline: composerChartBody(dashboard.uuid).pipeline,
            chart: composerChartBody(dashboard.uuid).chart,
        });

        const loaded = await admin.get<Body<Dashboard>>(
            `/api/v1/dashboards/${dashboard.uuid}`,
        );
        expect(loaded.body.results.tiles).toEqual([
            expect.objectContaining({
                type: DashboardTileTypes.COMPOSER_CHART,
                properties: expect.objectContaining({
                    composerChartUuid: chart.uuid,
                    chartName: 'Orders by status',
                }),
            }),
        ]);
    });

    it('lets a dashboard viewer read the chart, and no one from another organization', async () => {
        const dashboard = await createDashboard();
        const chart = await createChart(dashboard.uuid);

        const viewer = await loginAsViewer();
        const read = await viewer.get<Body<ComposerChart>>(
            `${chartsUrl}/${chart.uuid}`,
        );
        expect(read.status).toBe(200);
        expect(read.body.results.pipeline).toEqual(chart.pipeline);

        const outsider = await anotherLogin();
        const refused = await outsider.get(`${chartsUrl}/${chart.uuid}`, {
            failOnStatusCode: false,
        });
        expect(refused.status).toBe(403);
    });

    it('refuses a tile naming a chart another dashboard owns', async () => {
        const owner = await createDashboard();
        const chart = await createChart(owner.uuid);
        const other = await createDashboard();

        const refused = await addComposerTile(other, chart.uuid);
        expect(refused.status).toBe(404);
    });

    it('refuses a viewer creating a chart', async () => {
        const dashboard = await createDashboard();
        const viewer = await loginAsViewer();
        const refused = await viewer.post(
            chartsUrl,
            composerChartBody(dashboard.uuid),
            { failOnStatusCode: false },
        );
        expect(refused.status).toBe(403);
    });

    describe('custom chart type', () => {
        const vizUrl = `/api/v1/ee/projects/${projectUuid}/apps/visualizations/${SEED_DATA_APP_VIZ.appUuid}`;
        const customChart = (
            config: Record<string, unknown> = {},
        ): CreateComposerChart['chart'] => ({
            ...composerChartBody('').chart,
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: SEED_DATA_APP_VIZ.appUuid,
                    fieldMapping: { status: 'orders_status' },
                    ...config,
                },
            },
        });
        const createCustomChart = async () => {
            const created = await createComposerDashboard(
                apiClientSend(admin),
                { chart: customChart() },
            );
            tracker.trackDashboard(created.dashboard.uuid);
            return created.chart;
        };
        const renderUrl = (
            chartUuid: string,
            vizUuid = SEED_DATA_APP_VIZ.appUuid,
        ) =>
            `/api/v1/ee/projects/${projectUuid}/apps/visualizations/${vizUuid}/composer-charts/${chartUuid}`;

        it('pins the latest renderable version when the chart names none', async () => {
            const chart = await createCustomChart();
            expect(chart.chart.chartConfig).toEqual({
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: SEED_DATA_APP_VIZ.appUuid,
                    dataAppVizVersion: SEED_DATA_APP_VIZ.version,
                    fieldMapping: { status: 'orders_status' },
                },
            });
        });

        it.each([
            [
                'an unknown slot',
                {
                    fieldMapping: {
                        status: 'orders_status',
                        size: 'orders_status',
                    },
                },
                'size',
            ],
            [
                'a version that does not render',
                { dataAppVizVersion: 99 },
                'version 99',
            ],
        ])('refuses %s, naming it', async (_, config, named) => {
            const dashboard = await createDashboard();
            const refused = await admin.post<{ error: { message: string } }>(
                chartsUrl,
                {
                    ...composerChartBody(dashboard.uuid),
                    chart: customChart(config),
                },
                { failOnStatusCode: false },
            );
            expect(refused.status).toBeGreaterThanOrEqual(400);
            expect(refused.body.error.message).toContain(named);
        });

        it('renders for a dashboard viewer at the pinned version only, and for no one outside', async () => {
            const chart = await createCustomChart();
            const viewer = await loginAsViewer();

            const metadata = await viewer.get<
                Body<{ state: string; version?: number }>
            >(`${renderUrl(chart.uuid)}/render-metadata`);
            expect(metadata.status).toBe(200);
            const token = await viewer.get(
                `${renderUrl(chart.uuid)}/versions/${SEED_DATA_APP_VIZ.version}/preview-token`,
            );
            expect(token.status).toBe(200);

            const otherVersion = await viewer.get(
                `${renderUrl(chart.uuid)}/versions/${SEED_DATA_APP_VIZ.version + 1}/preview-token`,
                { failOnStatusCode: false },
            );
            expect(otherVersion.status).toBe(403);
            const otherType = await viewer.get(
                `${renderUrl(chart.uuid, randomUUID())}/render-metadata`,
                { failOnStatusCode: false },
            );
            expect(otherType.status).toBe(403);
            const outsider = await anotherLogin();
            const refused = await outsider.get(
                `${renderUrl(chart.uuid)}/render-metadata`,
                { failOnStatusCode: false },
            );
            expect(refused.status).toBe(403);
        });

        it("counts the chart in the type's delete and upgrade warnings", async () => {
            const counts = async () => ({
                deleted: (
                    await admin.get<Body<{ chartCount: number }>>(
                        `${vizUrl}/delete-impact`,
                    )
                ).body.results.chartCount,
                upgraded: (
                    await admin.get<
                        Body<{ chartCount: number; pinnedChartCount: number }>
                    >(`${vizUrl}/upgrade-impact`)
                ).body.results,
            });
            const before = await counts();
            await createCustomChart();
            const after = await counts();
            expect(after.deleted).toBe(before.deleted + 1);
            expect(after.upgraded).toEqual({
                chartCount: before.upgraded.chartCount + 1,
                pinnedChartCount: before.upgraded.pinnedChartCount + 1,
            });
        });
    });

    describe('dashboard lifecycle', () => {
        it('duplicates a dashboard with a copy of its chart', async () => {
            const { dashboard: created, chart } =
                await createDashboardWithSqlChart();
            const [composerTile] = created.tiles;
            const withFilter = await admin.patch<Body<Dashboard>>(
                `/api/v1/dashboards/${created.uuid}`,
                {
                    tiles: created.tiles,
                    tabs: created.tabs,
                    filters: {
                        dimensions: [
                            {
                                id: randomUUID(),
                                target: {
                                    fieldId: 'orders_status',
                                    tableName: 'orders',
                                },
                                operator: FilterOperator.EQUALS,
                                values: ['completed'],
                                tileTargets: { [composerTile.uuid]: false },
                            },
                        ],
                        metrics: [],
                        tableCalculations: [],
                    },
                },
            );
            const dashboard = withFilter.body.results;

            const copy = await duplicate(dashboard);
            const [copiedTile] = copy.tiles;
            expect(copy.filters.dimensions[0].tileTargets).toEqual({
                [copiedTile.uuid]: false,
            });

            const [copiedChartUuid] = composerChartUuidsOn(copy);
            expect(copiedChartUuid).toEqual(expect.any(String));
            expect(copiedChartUuid).not.toBe(chart.uuid);
            const copied = await getChart(copiedChartUuid!);
            expect(copied.body.results).toMatchObject({
                owner: { type: 'dashboard', dashboardUuid: copy.uuid },
                name: chart.name,
                pipeline: chart.pipeline,
                chart: chart.chart,
            });
            expect(copied.body.results.slug).not.toBe(chart.slug);

            // Removing the copy's tile leaves the original untouched
            expect((await saveTiles(copy, [])).status).toBe(200);
            expect(
                composerChartUuidsOn(await getDashboard(dashboard.uuid)),
            ).toEqual([chart.uuid]);
            expect((await getChart(chart.uuid)).status).toBe(200);
        });

        it('lets an editor without SQL runner rights duplicate and roll back a SQL-backed dashboard', async () => {
            const editor = await loginAsEditor();
            const { dashboard, chart } = await createDashboardWithSqlChart();
            const refused = await editor.post(
                chartsUrl,
                { ...composerChartBody(dashboard.uuid), pipeline: sqlPipeline },
                { failOnStatusCode: false },
            );
            expect(refused.status).toBe(403);

            const copy = await duplicate(dashboard, editor);
            expect(composerChartUuidsOn(copy)).toHaveLength(1);

            expect((await saveTiles(dashboard, [], editor)).status).toBe(200);
            const rollback = await editor.post(
                `/api/v1/dashboards/${dashboard.uuid}/rollback/${dashboard.versionUuid}`,
                {},
                { failOnStatusCode: false },
            );
            expect(rollback.status).toBe(200);
            expect(
                composerChartUuidsOn(await getDashboard(dashboard.uuid)),
            ).toEqual([chart.uuid]);
        });

        it('rolls a removed tile back with its chart as it was then', async () => {
            const { dashboard, chart } = await createDashboardWithSqlChart();
            const withTileVersion = dashboard.versionUuid;
            expect((await saveTiles(dashboard, [])).status).toBe(200);

            const rollback = await admin.post(
                `/api/v1/dashboards/${dashboard.uuid}/rollback/${withTileVersion}`,
                {},
            );
            expect(rollback.status).toBe(200);

            expect(
                composerChartUuidsOn(await getDashboard(dashboard.uuid)),
            ).toEqual([chart.uuid]);
            const rolledBack = (await getChart(chart.uuid)).body.results;
            expect(rolledBack.pipeline).toEqual(chart.pipeline);
            expect(rolledBack.versionUuid).not.toBe(chart.versionUuid);
        });

        it('removes a chart with no tile on the next save', async () => {
            const dashboard = await createDashboard();
            const untiled = await createChart(dashboard.uuid);

            expect((await saveTiles(dashboard, [])).status).toBe(200);

            expect((await getChart(untiled.uuid)).status).toBe(404);
        });

        it('deletes the chart with its dashboard, when two versions show it', async () => {
            const { dashboard, chart } = await createDashboardWithSqlChart();
            // Each version's tile row is cascaded while the chart's delete sets it null
            expect((await saveTiles(dashboard, dashboard.tiles)).status).toBe(
                200,
            );

            const deleted = await admin.delete(
                `/api/v1/dashboards/${dashboard.uuid}`,
            );
            expect(deleted.status).toBe(200);

            expect((await getChart(chart.uuid)).status).toBe(404);
            const gone = await admin.get(
                `/api/v1/dashboards/${dashboard.uuid}`,
                {
                    failOnStatusCode: false,
                },
            );
            expect(gone.status).toBe(404);
        });
    });

    describe('bound run', () => {
        it('lets a dashboard viewer run every node, sql, merge and duckdb included, and read its rows', async () => {
            const { dashboard, chart, tileUuid } =
                await createRunnableDashboard();
            const viewer = await loginAsViewer();
            // The viewer cannot run SQL or compose queries of their own
            const ownSql = await viewer.post(
                `/api/v2/projects/${projectUuid}/query/sql`,
                { sql: 'SELECT 1' },
                { failOnStatusCode: false },
            );
            expect(ownSql.status).toBe(403);

            const run = await viewer.post<Body<ComposerChartRunResults>>(
                tileRunUrl,
                runRequest(chart.uuid, dashboard.uuid, tileUuid),
            );
            expect(run.status).toBe(200);
            expect(
                run.body.results.queries.map(({ nodeId }) => nodeId).sort(),
            ).toEqual(
                everyKindPipeline.nodes.map(({ nodeId }) => nodeId).sort(),
            );
            for (const { queryUuid } of run.body.results.queries) {
                // eslint-disable-next-line no-await-in-loop
                expect(
                    (await pollRows(viewer, queryUuid)).length,
                ).toBeGreaterThan(0);
            }
        });

        it('refuses a run request carrying nodes, or naming a chart its dashboard does not own', async () => {
            const { dashboard, chart, tileUuid } =
                await createRunnableDashboard();
            const withNodes = await admin.post<{ error: { message: string } }>(
                tileRunUrl,
                {
                    ...runRequest(chart.uuid, dashboard.uuid, tileUuid),
                    nodes: [
                        {
                            sourceType: QuerySourceType.SQL,
                            nodeId: 'raw',
                            sql: 'SELECT 1',
                        },
                    ],
                },
                { failOnStatusCode: false },
            );
            expect(withNodes.status).toBe(400);
            expect(withNodes.body.error.message).toContain('nodes');

            const other = await createRunnableDashboard();
            const otherChart = await admin.post(
                tileRunUrl,
                runRequest(other.chart.uuid, dashboard.uuid, tileUuid),
                { failOnStatusCode: false },
            );
            expect(otherChart.status).toBe(403);
        });

        it('still runs a tile for a caller on the deprecated run route, telling it to move', async () => {
            const { dashboard, chart, tileUuid } =
                await createRunnableDashboard();
            const { composerChartUuid, ...oldBody } = runRequest(
                chart.uuid,
                dashboard.uuid,
                tileUuid,
            );
            const run = await admin.post<Body<ComposerChartRunResults>>(
                deprecatedRunUrl(composerChartUuid),
                oldBody,
            );
            expect(run.status).toBe(200);
            expect(run.headers.get('Deprecation')).not.toBeNull();
            expect(run.headers.get('Warning')).toContain(
                'query/dashboard-composer-chart',
            );
            expect(
                run.body.results.queries.map(({ nodeId }) => nodeId).sort(),
            ).toEqual(
                everyKindPipeline.nodes.map(({ nodeId }) => nodeId).sort(),
            );
        });

        it('refuses a run from another organization', async () => {
            const { dashboard, chart, tileUuid } =
                await createRunnableDashboard();
            const outsider = await anotherLogin();
            const refused = await outsider.post(
                tileRunUrl,
                runRequest(chart.uuid, dashboard.uuid, tileUuid),
                { failOnStatusCode: false },
            );
            expect(refused.status).toBe(403);
        });

        it('returns a semantic-layer chart’s own fields, so the tile draws the project’s labels and formats', async () => {
            const { dashboard, chart } = await createComposerDashboard(
                apiClientSend(admin),
            );
            tracker.trackDashboard(dashboard.uuid);
            const viewer = await loginAsViewer();
            const run = await viewer.post<Body<ComposerChartRunResults>>(
                tileRunUrl,
                runRequest(chart.uuid, dashboard.uuid, dashboard.tiles[0].uuid),
            );
            expect(run.status).toBe(200);
            expect(run.body.results.chartStageQueryUuid).toBeNull();
            expect(run.body.results.fields).toMatchObject({
                orders_status: {
                    table: 'orders',
                    fieldType: FieldType.DIMENSION,
                },
                orders_total_order_amount: {
                    table: 'orders',
                    fieldType: FieldType.METRIC,
                },
            });
        });

        it('runs a one-node semantic-layer chart to the same rows as the classic query', async () => {
            const { dashboard, chart } = await createComposerDashboard(
                apiClientSend(admin),
            );
            tracker.trackDashboard(dashboard.uuid);
            const run = await admin.post<Body<ComposerChartRunResults>>(
                tileRunUrl,
                runRequest(chart.uuid, dashboard.uuid, dashboard.tiles[0].uuid),
            );
            expect(run.status).toBe(200);
            const [node] = chart.pipeline.nodes;
            if (node.sourceType !== QuerySourceType.SEMANTIC_LAYER) {
                throw new Error('Expected a semantic-layer node');
            }
            const classic = await admin.post<Body<{ queryUuid: string }>>(
                `/api/v2/projects/${projectUuid}/query/metric-query`,
                {
                    context: 'exploreView',
                    query: {
                        exploreName: node.exploreName,
                        dimensions: node.dimensions,
                        metrics: node.metrics,
                        filters: {},
                        sorts: [],
                        limit: 500,
                        tableCalculations: [],
                    },
                },
            );
            expect(classic.status).toBe(200);
            const sortedRaw = (rows: unknown[]) =>
                JSON.stringify(
                    (rows as Record<string, { value: { raw: unknown } }>[])
                        .map((row) =>
                            Object.fromEntries(
                                Object.entries(row).map(([id, { value }]) => [
                                    id,
                                    value.raw,
                                ]),
                            ),
                        )
                        .sort((a, b) =>
                            JSON.stringify(a).localeCompare(JSON.stringify(b)),
                        ),
                );
            expect(
                sortedRaw(
                    await pollRows(
                        admin,
                        run.body.results.queries[0].queryUuid,
                    ),
                ),
            ).toBe(
                sortedRaw(
                    await pollRows(admin, classic.body.results.queryUuid),
                ),
            );
        });

        it('runs a group-by as a server-built pivot stage whose rows a viewer can read', async () => {
            const { dashboard, chart } = await createComposerDashboard(
                apiClientSend(admin),
                {
                    pipeline: {
                        schemaVersion: 1,
                        terminalNodeId: 'orders',
                        nodes: [
                            {
                                sourceType: QuerySourceType.SQL,
                                nodeId: 'orders',
                                title: 'Orders by status and size',
                                sql: "SELECT status, CASE WHEN amount > 10 THEN 'big' ELSE 'small' END AS size, sum(amount) AS total FROM postgres.jaffle.orders GROUP BY 1, 2",
                            },
                        ],
                    },
                    chart: {
                        schemaVersion: 1,
                        columns: [
                            {
                                reference: 'status',
                                fieldType: FieldType.DIMENSION,
                            },
                            {
                                reference: 'size',
                                fieldType: FieldType.DIMENSION,
                            },
                            { reference: 'total', fieldType: FieldType.METRIC },
                        ],
                        chartConfig: {
                            type: ChartType.CARTESIAN,
                            config: {
                                layout: {
                                    xField: 'status',
                                    yField: ['total'],
                                },
                                eChartsConfig: {},
                            },
                        },
                        pivotConfig: { columns: ['size'] },
                        tableConfig: { columnOrder: [] },
                    },
                },
            );
            tracker.trackDashboard(dashboard.uuid);
            const viewer = await loginAsViewer();
            const run = await viewer.post<Body<ComposerChartRunResults>>(
                tileRunUrl,
                runRequest(chart.uuid, dashboard.uuid, dashboard.tiles[0].uuid),
            );
            expect(run.status).toBe(200);
            const { chartStageQueryUuid, queries } = run.body.results;
            if (!chartStageQueryUuid) {
                throw new Error('No series-split stage ran');
            }
            expect(queries.map(({ queryUuid }) => queryUuid)).toContain(
                chartStageQueryUuid,
            );
            expect(
                (await pollRows(viewer, chartStageQueryUuid)).length,
            ).toBeGreaterThan(0);
        });

        it('refuses a run with the flag off while classic queries still run', async () => {
            const { dashboard, chart, tileUuid } =
                await createRunnableDashboard();
            expect((await admin.post(flagUrl, { enabled: false })).status).toBe(
                200,
            );
            try {
                const refused = await admin.post<{
                    error: { data?: { featureFlagId?: string } };
                }>(
                    tileRunUrl,
                    runRequest(chart.uuid, dashboard.uuid, tileUuid),
                    {
                        failOnStatusCode: false,
                    },
                );
                expect(refused.status).toBe(403);
                expect(refused.body.error.data?.featureFlagId).toBe(
                    FeatureFlags.ComposerCharts,
                );
                const classic = await admin.post(
                    `/api/v2/projects/${projectUuid}/query/metric-query`,
                    {
                        context: 'dashboardView',
                        query: {
                            exploreName: 'orders',
                            dimensions: ['orders_status'],
                            metrics: ['orders_total_order_amount'],
                            filters: {},
                            sorts: [],
                            limit: 10,
                            tableCalculations: [],
                        },
                    },
                );
                expect(classic.status).toBe(200);
            } finally {
                expect(
                    (await admin.post(flagUrl, { enabled: true })).status,
                ).toBe(200);
            }
        });
    });

    describe('dashboard filters and parameters', () => {
        const rawValues = (rows: unknown[], column: string) =>
            [
                ...new Set(
                    (rows as Record<string, { value: { raw: unknown } }>[]).map(
                        (row) => row[column]?.value.raw,
                    ),
                ),
            ].sort();

        const queryOf = (results: ComposerChartRunResults, nodeId: string) => {
            const query = results.queries.find((q) => q.nodeId === nodeId);
            if (!query) throw new Error(`Node ${nodeId} did not run`);
            return query.queryUuid;
        };

        const statusRule = (
            id: string,
            values: string[],
            tileTargets?: Record<string, false | DashboardFieldTarget>,
        ) => ({
            id,
            label: undefined,
            target: { fieldId: 'orders_status', tableName: 'orders' },
            operator: FilterOperator.EQUALS,
            values,
            ...(tileTargets && { tileTargets }),
        });

        it('a dashboard parameter reaches a semantic-layer node and a DuckDB node', async () => {
            const { dashboard, chart } = await createComposerDashboard(
                apiClientSend(admin),
                {
                    pipeline: {
                        schemaVersion: 1,
                        terminalNodeId: 'tagged',
                        nodes: [
                            {
                                sourceType: QuerySourceType.SEMANTIC_LAYER,
                                nodeId: 'dates',
                                title: 'Dates',
                                exploreName: 'orders',
                                dimensions: ['orders_date_custom_param_test'],
                                metrics: ['orders_unique_order_count'],
                            },
                            {
                                sourceType: QuerySourceType.DUCKDB,
                                nodeId: 'tagged',
                                title: 'Tagged',
                                // eslint-disable-next-line no-template-curly-in-string
                                sql: 'SELECT ${lightdash.parameters.currency} AS currency, count(*) AS n FROM dates',
                                references: ['dates'],
                            },
                        ],
                    },
                    chart: {
                        schemaVersion: 1,
                        columns: [
                            {
                                reference: 'currency',
                                fieldType: FieldType.DIMENSION,
                            },
                            { reference: 'n', fieldType: FieldType.METRIC },
                        ],
                        chartConfig: {
                            type: ChartType.CARTESIAN,
                            config: {
                                layout: { xField: 'currency', yField: ['n'] },
                                eChartsConfig: {},
                            },
                        },
                        pivotConfig: null,
                        tableConfig: { columnOrder: [] },
                    },
                },
            );
            tracker.trackDashboard(dashboard.uuid);
            const viewer = await loginAsViewer();
            const runWith = async (parameters: Record<string, string>) => {
                const run = await viewer.post<Body<ComposerChartRunResults>>(
                    tileRunUrl,
                    {
                        ...runRequest(
                            chart.uuid,
                            dashboard.uuid,
                            dashboard.tiles[0].uuid,
                        ),
                        parameters,
                    },
                );
                expect(run.status).toBe(200);
                return {
                    results: run.body.results,
                    dates: rawValues(
                        await pollRows(
                            viewer,
                            queryOf(run.body.results, 'dates'),
                        ),
                        'orders_date_custom_param_test',
                    ),
                    currency: rawValues(
                        await pollRows(
                            viewer,
                            queryOf(run.body.results, 'tagged'),
                        ),
                        'currency',
                    ),
                };
            };

            const early = await runWith({
                date_custom_parameter: '2000-01-01',
                currency: 'usd',
            });
            const late = await runWith({
                date_custom_parameter: '2100-01-01',
                currency: 'eur',
            });

            expect(early.dates).toEqual(['I feel great!!!']);
            expect(late.dates).toEqual(['I feel less than...']);
            expect(early.currency).toEqual(['usd']);
            expect(late.currency).toEqual(['eur']);
            expect([...early.results.parameterReferences].sort()).toEqual([
                'currency',
                'date_custom_parameter',
            ]);
            expect(late.results.usedParameterValuesByNodeId).toMatchObject({
                dates: { date_custom_parameter: '2100-01-01' },
                tagged: { currency: 'eur' },
            });
        });

        it('a dashboard filter reaches every semantic-layer node with the field and replaces a node rule on it', async () => {
            const [amounts, counts, ...rest] = everyKindPipeline.nodes;
            if (amounts.sourceType !== QuerySourceType.SEMANTIC_LAYER) {
                throw new Error('Expected a semantic-layer node');
            }
            const { dashboard, chart } = await createComposerDashboard(
                apiClientSend(admin),
                {
                    pipeline: {
                        ...everyKindPipeline,
                        nodes: [
                            {
                                ...amounts,
                                filters: {
                                    dimensions: {
                                        id: 'node-group',
                                        and: [
                                            {
                                                id: 'node-status',
                                                target: {
                                                    fieldId: 'orders_status',
                                                },
                                                operator: FilterOperator.EQUALS,
                                                values: ['completed'],
                                            },
                                        ],
                                    },
                                },
                            },
                            counts,
                            ...rest,
                        ],
                    },
                },
            );
            tracker.trackDashboard(dashboard.uuid);
            const tileUuid = dashboard.tiles[0].uuid;
            const viewer = await loginAsViewer();
            const runWith = async (
                dimensions: ReturnType<typeof statusRule>[],
            ) => {
                const run = await viewer.post<Body<ComposerChartRunResults>>(
                    tileRunUrl,
                    {
                        ...runRequest(chart.uuid, dashboard.uuid, tileUuid),
                        dashboardFilters: {
                            dimensions,
                            metrics: [],
                            tableCalculations: [],
                        },
                    },
                );
                expect(run.status).toBe(200);
                return run.body.results;
            };
            const statusesOf = async (
                results: ComposerChartRunResults,
                nodeId: string,
            ) =>
                rawValues(
                    await pollRows(viewer, queryOf(results, nodeId)),
                    'orders_status',
                );

            const filtered = await runWith([statusRule('dash', ['shipped'])]);
            expect(
                Object.keys(filtered.appliedDashboardFiltersByNodeId).sort(),
            ).toEqual(['amounts', 'counts']);
            expect(
                filtered.appliedDashboardFilters.dimensions.map((r) => r.id),
            ).toEqual(['dash']);
            expect(await statusesOf(filtered, 'amounts')).toEqual(['shipped']);
            expect(await statusesOf(filtered, 'counts')).toEqual(['shipped']);

            const unfiltered = await runWith([]);
            expect(await statusesOf(unfiltered, 'amounts')).toEqual([
                'completed',
            ]);
            expect(
                (await statusesOf(unfiltered, 'counts')).length,
            ).toBeGreaterThan(1);
        });

        it('a tile target naming a SQL column filters the SQL nodes with that column only', async () => {
            const { dashboard, chart } = await createComposerDashboard(
                apiClientSend(admin),
                { pipeline: everyKindPipeline },
            );
            tracker.trackDashboard(dashboard.uuid);
            const tileUuid = dashboard.tiles[0].uuid;
            const viewer = await loginAsViewer();
            const runWith = async (
                dimensions: ReturnType<typeof statusRule>[],
            ) => {
                const run = await viewer.post<Body<ComposerChartRunResults>>(
                    tileRunUrl,
                    {
                        ...runRequest(chart.uuid, dashboard.uuid, tileUuid),
                        dashboardFilters: {
                            dimensions,
                            metrics: [],
                            tableCalculations: [],
                        },
                    },
                );
                expect(run.status).toBe(200);
                return run.body.results;
            };
            const rowsOf = (results: ComposerChartRunResults, nodeId: string) =>
                pollRows(viewer, queryOf(results, nodeId));

            const unfiltered = await runWith([]);
            expect(
                unfiltered.sqlColumns.map((c) => c.reference).sort(),
            ).toEqual(['amount', 'status']);

            const filtered = await runWith([
                statusRule('dash', ['shipped'], {
                    [tileUuid]: {
                        fieldId: 'status',
                        tableName: 'mock_table',
                        isSqlColumn: true,
                    },
                }),
            ]);
            const rawRows = await rowsOf(filtered, 'raw');
            expect(rawRows.length).toBeLessThan(
                (await rowsOf(unfiltered, 'raw')).length,
            );
            expect(rawValues(rawRows, 'status')).toEqual(['shipped']);
            // The semantic-layer nodes have no column target, so stay whole
            expect(
                rawValues(await rowsOf(filtered, 'counts'), 'orders_status')
                    .length,
            ).toBeGreaterThan(1);
            expect(
                Object.keys(filtered.appliedDashboardFiltersByNodeId),
            ).toEqual(['raw']);
            expect(
                filtered.appliedDashboardFilters.dimensions.map((r) => r.id),
            ).toEqual(['dash']);
        });

        it('leaves the tile unchanged for a filter no node has, or one switched off for the tile', async () => {
            const { dashboard, chart, tileUuid } =
                await createRunnableDashboard();
            for (const rule of [
                {
                    ...statusRule('missing', ['x']),
                    target: { fieldId: 'nowhere_field', tableName: 'nowhere' },
                },
                statusRule('off', ['shipped'], { [tileUuid]: false }),
            ]) {
                // eslint-disable-next-line no-await-in-loop
                const run = await admin.post<Body<ComposerChartRunResults>>(
                    tileRunUrl,
                    {
                        ...runRequest(chart.uuid, dashboard.uuid, tileUuid),
                        dashboardFilters: {
                            dimensions: [rule],
                            metrics: [],
                            tableCalculations: [],
                        },
                    },
                );
                expect(run.status).toBe(200);
                expect(run.body.results.appliedDashboardFilters).toEqual({
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                });
                expect(
                    run.body.results.appliedDashboardFiltersByNodeId,
                ).toEqual({});
            }
        });

        it('offers the fields of every semantic-layer node in the filter picker', async () => {
            const { dashboard, chart } = await createComposerDashboard(
                apiClientSend(admin),
                {
                    pipeline: {
                        schemaVersion: 1,
                        terminalNodeId: 'joined',
                        nodes: [
                            {
                                sourceType: QuerySourceType.SEMANTIC_LAYER,
                                nodeId: 'orders',
                                title: 'Orders',
                                exploreName: 'orders',
                                dimensions: ['orders_status'],
                                metrics: ['orders_total_order_amount'],
                            },
                            {
                                sourceType: QuerySourceType.SEMANTIC_LAYER,
                                nodeId: 'payments',
                                title: 'Payments',
                                exploreName: 'payments',
                                dimensions: ['payments_payment_method'],
                                metrics: [],
                            },
                            {
                                sourceType: QuerySourceType.DUCKDB,
                                nodeId: 'joined',
                                title: 'Joined',
                                sql: 'SELECT * FROM orders, payments',
                                references: ['orders', 'payments'],
                            },
                        ],
                    },
                },
            );
            tracker.trackDashboard(dashboard.uuid);
            const tileUuid = dashboard.tiles[0].uuid;
            const viewer = await loginAsViewer();
            const resp = await viewer.post<
                Body<{
                    savedQueryFilters: Record<string, number[]>;
                    allFilterableFields: { table: string; name: string }[];
                }>
            >('/api/v1/dashboards/availableFilters', [
                {
                    tileType: DashboardTileTypes.COMPOSER_CHART,
                    tileUuid,
                    composerChartUuid: chart.uuid,
                },
            ]);
            expect(resp.status).toBe(200);
            const { savedQueryFilters, allFilterableFields } =
                resp.body.results;
            const tables = new Set(
                (savedQueryFilters[tileUuid] ?? []).map(
                    (index) => allFilterableFields[index].table,
                ),
            );
            expect(tables).toContain('orders');
            expect(tables).toContain('payments');

            const outsider = await anotherLogin();
            const refused = await outsider.post<
                Body<{ savedQueryFilters: Record<string, number[]> }>
            >('/api/v1/dashboards/availableFilters', [
                {
                    tileType: DashboardTileTypes.COMPOSER_CHART,
                    tileUuid,
                    composerChartUuid: chart.uuid,
                },
            ]);
            expect(refused.body.results.savedQueryFilters).toEqual({});
        });
    });

    describe('content as code', () => {
        const codeUrl = `/api/v1/projects/${projectUuid}/code`;

        const downloadChart = async (slug: string, client = admin) => {
            const resp = await client.get<
                Body<{ composerCharts: ComposerChartAsCode[] }>
            >(`${codeUrl}/composerCharts?ids=${slug}`);
            expect(resp.status).toBe(200);
            const [file] = resp.body.results.composerCharts;
            expect(file).toBeDefined();
            return file;
        };

        const downloadDashboard = async (slug: string) => {
            const resp = await admin.get<
                Body<{ dashboards: DashboardAsCode[] }>
            >(`${codeUrl}/dashboards?ids=${slug}`);
            expect(resp.status).toBe(200);
            return resp.body.results.dashboards[0];
        };

        const uploadChart = (
            file: ComposerChartAsCode,
            client: Pick<ApiClient, 'post'> = admin,
        ) =>
            client.post<
                Body<{ action: string; composerChartUuid: string }> & {
                    error: { message: string };
                }
            >(`${codeUrl}/composerCharts/${file.slug}`, file, {
                failOnStatusCode: false,
            });

        const uploadDashboard = (file: DashboardAsCode) =>
            admin.post<Body<unknown> & { error: { message: string } }>(
                `${codeUrl}/dashboards/${file.slug}`,
                file,
                { failOnStatusCode: false },
            );

        const composerTileOf = (file: DashboardAsCode) =>
            file.tiles.find(
                (tile) => tile.type === DashboardTileTypes.COMPOSER_CHART,
            );

        const withComposerTile = (
            file: DashboardAsCode,
            chartSlug: string,
            type = DashboardTileTypes.COMPOSER_CHART,
        ): DashboardAsCode =>
            ({
                ...file,
                tiles: [
                    {
                        type,
                        x: 0,
                        y: 0,
                        h: 6,
                        w: 12,
                        tabSlug: null,
                        tileSlug: undefined,
                        uuid: undefined,
                        properties: { title: 'From code', chartSlug },
                    },
                ],
            }) as DashboardAsCode;

        it('downloads the dashboard tile and the chart as stored, and changes nothing on re-upload', async () => {
            const { dashboard, chart } = await createDashboardWithSqlChart();
            const dashboardFile = await downloadDashboard(dashboard.slug);
            expect(composerTileOf(dashboardFile)?.properties).toEqual({
                title: 'Orders',
                hideTitle: false,
                chartSlug: chart.slug,
            });
            const file = await downloadChart(chart.slug);
            expect(file).toMatchObject({
                contentType: 'composer_chart',
                slug: chart.slug,
                name: chart.name,
                dashboardSlug: dashboard.slug,
                pipeline: chart.pipeline,
                chart: chart.chart,
            });

            const reuploaded = await uploadChart(file);
            expect(reuploaded.status).toBe(200);
            expect(reuploaded.body.results.action).toBe('no changes');
            expect((await uploadDashboard(dashboardFile)).status).toBe(200);
            expect((await getChart(chart.uuid)).body.results.versionUuid).toBe(
                chart.versionUuid,
            );
            expect(await downloadChart(chart.slug)).toMatchObject({
                pipeline: file.pipeline,
                chart: file.chart,
            });
            expect(
                composerChartUuidsOn(await getDashboard(dashboard.uuid)),
            ).toEqual([chart.uuid]);
        });

        it('creates a chart from a file, which a dashboard file then names', async () => {
            const dashboard = await createDashboard();
            const { dashboard: source } = await createDashboardWithSqlChart();
            const file = {
                ...(await downloadChart(
                    composerTileOf(await downloadDashboard(source.slug))!
                        .properties.chartSlug!,
                )),
                slug: uniqueName('composer-code')
                    .toLowerCase()
                    .replace(/\W+/g, '-'),
                dashboardSlug: dashboard.slug,
            };
            const created = await uploadChart(file);
            expect(created.status).toBe(200);
            expect(created.body.results.action).toBe('create');
            const stored = (
                await getChart(created.body.results.composerChartUuid)
            ).body.results;
            expect(stored).toMatchObject({
                slug: file.slug,
                owner: { type: 'dashboard', dashboardUuid: dashboard.uuid },
                pipeline: file.pipeline,
            });

            const named = await uploadDashboard(
                withComposerTile(
                    await downloadDashboard(dashboard.slug),
                    file.slug,
                ),
            );
            expect(named.status).toBe(200);
            expect(
                composerChartUuidsOn(await getDashboard(dashboard.uuid)),
            ).toEqual([stored.uuid]);
        });

        it('creates a placeholder dashboard for a chart naming one that does not exist', async () => {
            const { chart } = await createDashboardWithSqlChart();
            const dashboardSlug = uniqueName('composer placeholder')
                .toLowerCase()
                .replace(/\W+/g, '-');
            const file = {
                ...(await downloadChart(chart.slug)),
                slug: `${dashboardSlug}-chart`,
                dashboardSlug,
            };
            const created = await uploadChart(file);
            expect(created.status).toBe(200);
            const stored = (
                await getChart(created.body.results.composerChartUuid)
            ).body.results;
            if (stored.owner.type !== 'dashboard') {
                throw new Error('Expected the chart on a dashboard');
            }
            tracker.trackDashboard(stored.owner.dashboardUuid);
            const placeholder = await getDashboard(stored.owner.dashboardUuid);
            expect(placeholder).toMatchObject({
                slug: dashboardSlug,
                tiles: [],
            });
        });

        it('appends a version for a changed file, keeping the chart on its dashboard', async () => {
            const { dashboard, chart } = await createDashboardWithSqlChart();
            const other = await createDashboard();
            const file = await downloadChart(chart.slug);
            const changed = await uploadChart({
                ...file,
                name: 'Renamed from code',
                dashboardSlug: other.slug,
                chart: {
                    ...file.chart,
                    pivotConfig: { columns: ['orders_status'] },
                },
            });
            expect(changed.status).toBe(200);
            expect(changed.body.results.action).toBe('update');
            const stored = (await getChart(chart.uuid)).body.results;
            expect(stored.versionUuid).not.toBe(chart.versionUuid);
            expect(stored).toMatchObject({
                name: 'Renamed from code',
                owner: { type: 'dashboard', dashboardUuid: dashboard.uuid },
                chart: { pivotConfig: { columns: ['orders_status'] } },
            });
            // A group-by round-trips like any other chart
            const again = await uploadChart(await downloadChart(chart.slug));
            expect(again.body.results.action).toBe('no changes');
        });

        it('refuses a rollback that changes a chart to a pipeline the user may not save', async () => {
            const editor = await loginAsEditor();
            const { dashboard, chart } = await createDashboardWithSqlChart();
            const changedSql =
                'select status as orders_status, max(amount) as orders_total_order_amount from orders group by 1';
            const changed = await uploadChart({
                ...(await downloadChart(chart.slug)),
                pipeline: {
                    schemaVersion: 1,
                    terminalNodeId: 'orders',
                    nodes: [
                        {
                            sourceType: QuerySourceType.SQL,
                            nodeId: 'orders',
                            title: 'Orders by status',
                            sql: changedSql,
                        },
                    ],
                },
            });
            expect(changed.body.results.action).toBe('update');
            const current = await getDashboard(dashboard.uuid);
            const saved = await saveTiles(current, current.tiles);
            expect(saved.status).toBe(200);
            const rollbackUrl = `/api/v1/dashboards/${dashboard.uuid}/rollback/${dashboard.versionUuid}`;

            const refused = await editor.post(
                rollbackUrl,
                {},
                { failOnStatusCode: false },
            );
            expect(refused.status).toBe(403);
            expect(
                (await getChart(chart.uuid)).body.results.pipeline.nodes[0],
            ).toMatchObject({ sql: changedSql });
            expect((await getDashboard(dashboard.uuid)).versionUuid).toBe(
                saved.body.results.versionUuid,
            );

            expect((await admin.post(rollbackUrl, {})).status).toBe(200);
            expect((await getChart(chart.uuid)).body.results.pipeline).toEqual(
                chart.pipeline,
            );
        });

        it('writes a custom chart type as its slug and refuses one missing from the project', async () => {
            const created = await createComposerDashboard(
                apiClientSend(admin),
                {
                    chart: {
                        ...composerChartBody('').chart,
                        chartConfig: {
                            type: ChartType.DATA_APP_VIZ,
                            config: {
                                dataAppVizUuid: SEED_DATA_APP_VIZ.appUuid,
                                fieldMapping: { status: 'orders_status' },
                            },
                        },
                    },
                },
            );
            tracker.trackDashboard(created.dashboard.uuid);
            const file = await downloadChart(created.chart.slug);
            const { chartConfig } = file.chart;
            expect(chartConfig).toEqual({
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizSlug: expect.any(String),
                    dataAppVizVersion: SEED_DATA_APP_VIZ.version,
                    fieldMapping: { status: 'orders_status' },
                },
            });
            expect((await uploadChart(file)).body.results.action).toBe(
                'no changes',
            );

            const missing = await uploadChart({
                ...file,
                chart: {
                    ...file.chart,
                    chartConfig: {
                        type: ChartType.DATA_APP_VIZ,
                        config: {
                            dataAppVizSlug: 'not-in-this-project',
                            fieldMapping: { status: 'orders_status' },
                        },
                    },
                },
            });
            expect(missing.status).toBe(404);
            expect(missing.body.error.message).toContain('Upload it first');
        });

        it('resolves a composer tile among composer charts only, and fails naming a missing or foreign chart', async () => {
            const { chart } = await createDashboardWithSqlChart();
            const dashboard = await createDashboard();
            const file = await downloadDashboard(dashboard.slug);

            const foreign = await uploadDashboard(
                withComposerTile(file, chart.slug),
            );
            expect(foreign.status).toBe(400);
            expect(foreign.body.error.message).toContain(
                `Composer chart "${chart.slug}" belongs to another dashboard`,
            );

            // A classic chart's slug is never a composer chart
            const classicSlug =
                'how-much-revenue-do-we-have-per-payment-method';
            const missing = await uploadDashboard(
                withComposerTile(file, classicSlug),
            );
            expect(missing.status).toBe(404);
            expect(missing.body.error.message).toContain(
                `Composer chart "${classicSlug}" was not found`,
            );

            // And a saved_chart tile never resolves to a composer chart
            const classicTile = await uploadDashboard(
                withComposerTile(
                    file,
                    chart.slug,
                    DashboardTileTypes.SAVED_CHART,
                ),
            );
            expect(classicTile.status).toBe(200);
            const saved = await getDashboard(dashboard.uuid);
            expect(composerChartUuidsOn(saved)).toEqual([]);
            expect(saved.tiles.map(({ type }) => type)).toEqual([
                DashboardTileTypes.SAVED_CHART,
            ]);
        });

        it('refuses a chart with a sql or merge node to an org:edit service account, but lets it re-upload one unchanged', async () => {
            const { chart } = await createDashboardWithSqlChart();
            const file = await downloadChart(chart.slug);
            const account = await admin.post<
                Body<{ token: string; uuid: string }>
            >('/api/v1/service-accounts', {
                description: uniqueName('composer org:edit'),
                expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                scopes: [ServiceAccountScope.ORG_EDIT],
            });
            const serviceAccount = new ApiClient();
            const post: Pick<ApiClient, 'post'>['post'] = (
                path,
                body,
                options,
            ) =>
                serviceAccount.post(path, body, {
                    ...options,
                    headers: {
                        Authorization: `Bearer ${account.body.results.token}`,
                    },
                });
            try {
                const unchanged = await uploadChart(file, { post });
                expect(unchanged.status).toBe(200);
                expect(unchanged.body.results.action).toBe('no changes');

                const refused = await uploadChart(
                    { ...file, name: 'Changed by a service account' },
                    { post },
                );
                expect(refused.status).toBe(403);
                expect(refused.body.error.message).toContain('SQL runner');

                const merge = await uploadChart(
                    {
                        ...file,
                        pipeline: {
                            schemaVersion: 1,
                            terminalNodeId: 'merged',
                            nodes: everyKindPipeline.nodes.filter(
                                ({ nodeId }) =>
                                    ['amounts', 'counts', 'merged'].includes(
                                        nodeId,
                                    ),
                            ),
                        },
                    },
                    { post },
                );
                expect(merge.status).toBe(403);
                expect(merge.body.error.message).toContain('merge');

                // Refused before any write: no placeholder dashboard is left
                const placeholderSlug = `${chart.slug}-never-created`;
                const refusedNew = await uploadChart(
                    {
                        ...file,
                        slug: `${placeholderSlug}-chart`,
                        dashboardSlug: placeholderSlug,
                    },
                    { post },
                );
                expect(refusedNew.status).toBe(403);
                const leftovers = await admin.get<
                    Body<{ dashboards: unknown[] }>
                >(`${codeUrl}/dashboards?ids=${placeholderSlug}`);
                expect(leftovers.body.results.dashboards).toEqual([]);
            } finally {
                await admin.delete(
                    `/api/v1/service-accounts/${account.body.results.uuid}`,
                );
            }
        });

        it('refuses a composer chart file on the classic chart route, as an old CLI sends it', async () => {
            const { chart } = await createDashboardWithSqlChart();
            const file = await downloadChart(chart.slug);
            const refused = await admin.post<{ error: { message: string } }>(
                `${codeUrl}/charts/${chart.slug}`,
                file,
                { failOnStatusCode: false },
            );
            expect(refused.status).toBe(400);
            expect(refused.body.error.message).toContain(
                'Upgrade your CLI to 3.266.0 or later',
            );
        });

        it('with the flag off, downloads and keeps what exists but refuses new or changed composer content', async () => {
            const { dashboard, chart } = await createDashboardWithSqlChart();
            const empty = await createDashboard();
            const file = await downloadChart(chart.slug);
            const dashboardFile = await downloadDashboard(dashboard.slug);
            expect((await admin.post(flagUrl, { enabled: false })).status).toBe(
                200,
            );
            try {
                expect(await downloadChart(chart.slug)).toMatchObject({
                    pipeline: chart.pipeline,
                });
                expect((await uploadChart(file)).body.results.action).toBe(
                    'no changes',
                );
                expect((await uploadDashboard(dashboardFile)).status).toBe(200);
                expect(
                    composerChartUuidsOn(await getDashboard(dashboard.uuid)),
                ).toEqual([chart.uuid]);

                const changed = await uploadChart({ ...file, name: 'Changed' });
                expect(changed.status).toBe(403);
                expect(changed.body.error.message).toContain(
                    `composer chart "${chart.slug}" cannot be created or changed`,
                );
                const created = await uploadChart({
                    ...file,
                    slug: `${chart.slug}-new`,
                    dashboardSlug: empty.slug,
                });
                expect(created.status).toBe(403);

                const removed = await uploadDashboard({
                    ...dashboardFile,
                    tiles: [],
                });
                expect(removed.status).toBe(200);
                expect(
                    composerChartUuidsOn(await getDashboard(dashboard.uuid)),
                ).toEqual([]);
                const readded = await uploadDashboard(dashboardFile);
                expect(readded.status).toBe(403);
                expect(readded.body.error.message).toContain(
                    `composer chart tile "${chart.slug}" cannot be added`,
                );
            } finally {
                expect(
                    (await admin.post(flagUrl, { enabled: true })).status,
                ).toBe(200);
            }
        });
    });

    describe('space-owned chart', () => {
        const createSpace = async (inheritParentPermissions = true) => {
            const resp = await admin.post<Body<Space>>(
                `/api/v1/projects/${projectUuid}/spaces`,
                {
                    name: uniqueName('Composer space'),
                    inheritParentPermissions,
                },
            );
            expect(resp.status).toBe(200);
            tracker.trackSpace(resp.body.results.uuid);
            return resp.body.results;
        };

        const createSpaceChart = async (
            stored: Parameters<typeof createComposerSpaceChart>[1] = {},
        ) => {
            const created = await createComposerSpaceChart(
                apiClientSend(admin),
                stored,
            );
            tracker.trackSpace(created.space.uuid);
            return created;
        };

        const postChart = (body: unknown, client: ApiClient = admin) =>
            client.post<
                Body<ComposerChart> & {
                    error: {
                        message: string;
                        data?: { featureFlagId?: string };
                    };
                }
            >(chartsUrl, body, { failOnStatusCode: false });

        const runChart = (
            client: ApiClient,
            body: ExecuteComposerChartRequest,
        ) =>
            client.post<
                Body<ComposerChartRunResults> & { error: { message: string } }
            >(chartRunUrl, body, { failOnStatusCode: false });

        it('lists in its space under Charts with its kind, counts in its space, and leaves both with the flag off', async () => {
            const parent = await createSpace();
            const childResp = await admin.post<Body<Space>>(
                `/api/v1/projects/${projectUuid}/spaces`,
                {
                    name: uniqueName('Composer child space'),
                    parentSpaceUuid: parent.uuid,
                },
            );
            expect(childResp.status).toBe(200);
            const child = childResp.body.results;
            tracker.trackSpace(child.uuid);
            const created = await postChart({
                ...composerSpaceChartBody(child.uuid),
                chart: {
                    ...composerSpaceChartBody(child.uuid).chart,
                    chartConfig: { type: ChartType.TABLE, config: {} },
                },
            });
            expect(created.status).toBe(201);
            const chart = created.body.results;
            // A chart its dashboard owns never lists, even in that dashboard's space
            const dashboard = await admin.post<Body<Dashboard>>(
                `/api/v1/projects/${projectUuid}/dashboards`,
                {
                    name: uniqueName('Composer dashboard'),
                    spaceUuid: child.uuid,
                    tiles: [],
                    tabs: [],
                },
            );
            expect(dashboard.status).toBe(201);
            tracker.trackDashboard(dashboard.body.results.uuid);
            expect(
                (
                    await postChart(
                        composerChartBody(dashboard.body.results.uuid),
                    )
                ).status,
            ).toBe(201);

            const viewer = await loginAsViewer();
            const list = async (
                spaceUuid: string,
                types: ContentType[],
                search = '',
            ) => {
                const query = types.map((t) => `contentTypes=${t}`).join('&');
                const resp = await viewer.get<Body<{ data: SummaryContent[] }>>(
                    `/api/v2/content?projectUuids=${projectUuid}&spaceUuids=${spaceUuid}&${query}&pageSize=100&search=${encodeURIComponent(search)}`,
                );
                expect(resp.status).toBe(200);
                return resp.body.results.data;
            };
            const charts = [ContentType.CHART, ContentType.COMPOSER_CHART];
            const childChartCount = async () =>
                (await list(parent.uuid, [ContentType.SPACE])).find(
                    (item) => item.uuid === child.uuid,
                );
            const impact = async () =>
                (
                    await admin.get<Body<SpaceDeleteImpact>>(
                        `/api/v1/projects/${projectUuid}/spaces/${parent.uuid}/delete-impact`,
                    )
                ).body.results;

            expect(await list(child.uuid, charts)).toEqual([
                expect.objectContaining({
                    contentType: ContentType.COMPOSER_CHART,
                    uuid: chart.uuid,
                    name: chart.name,
                    chartKind: ChartKind.TABLE,
                    space: { uuid: child.uuid, name: child.name },
                    views: 0,
                    lastUpdatedBy: expect.objectContaining({
                        firstName: expect.any(String),
                    }),
                }),
            ]);
            expect(await list(child.uuid, [ContentType.CHART])).toEqual([]);
            expect(
                (await list(child.uuid, charts, 'by stat')).map((c) => c.uuid),
            ).toEqual([chart.uuid]);
            expect(await list(child.uuid, charts, 'no such chart')).toEqual([]);
            expect(await childChartCount()).toMatchObject({ chartCount: 1 });
            expect(await impact()).toMatchObject({
                chartCount: 1,
                charts: [expect.objectContaining({ uuid: chart.uuid })],
            });

            expect((await admin.post(flagUrl, { enabled: false })).status).toBe(
                200,
            );
            try {
                expect(await list(child.uuid, charts)).toEqual([]);
                expect(await childChartCount()).toMatchObject({
                    chartCount: 0,
                });
                expect(await impact()).toMatchObject({ chartCount: 1 });
            } finally {
                expect(
                    (await admin.post(flagUrl, { enabled: true })).status,
                ).toBe(200);
            }
        });

        // Skipped when SOFT_DELETE_ENABLED is off (delete is permanent)
        it("counts a child space's chart in a deleted space's Recently deleted row", async (ctx) => {
            const health =
                await admin.get<Body<{ softDelete: { enabled: boolean } }>>(
                    '/api/v1/health',
                );
            if (!health.body.results.softDelete.enabled) {
                // oxlint-disable-next-line vitest-js/no-disabled-tests -- runtime skip when soft delete is disabled on the server
                ctx.skip();
            }
            const parent = await createSpace();
            const child = await admin.post<Body<Space>>(
                `/api/v1/projects/${projectUuid}/spaces`,
                {
                    name: uniqueName('Composer child space'),
                    parentSpaceUuid: parent.uuid,
                },
            );
            expect(child.status).toBe(200);
            tracker.trackSpace(child.body.results.uuid);
            expect(
                (
                    await postChart(
                        composerSpaceChartBody(child.body.results.uuid),
                    )
                ).status,
            ).toBe(201);
            expect(
                (
                    await admin.delete(
                        `/api/v1/projects/${projectUuid}/spaces/${parent.uuid}`,
                    )
                ).status,
            ).toBe(200);

            const deleted = await admin.get<ApiDeletedContentResponse>(
                `/api/v2/content/deleted?projectUuids=${projectUuid}&contentTypes=${ContentType.SPACE}&pageSize=100`,
            );
            expect(deleted.status).toBe(200);
            expect(
                deleted.body.results.data.find(
                    (item) => item.uuid === parent.uuid,
                ),
            ).toMatchObject({ chartCount: 1 });
        });

        it('leaves a chart out of the listing for an editor who cannot see its space', async () => {
            const editor = await loginAsEditor();
            const privateSpace = await createSpace(false);
            const hidden = await postChart(
                composerSpaceChartBody(privateSpace.uuid),
            );
            expect(hidden.status).toBe(201);
            const listedFor = async (client: ApiClient) =>
                (
                    await client.get<Body<{ data: SummaryContent[] }>>(
                        `/api/v2/content?projectUuids=${projectUuid}&spaceUuids=${privateSpace.uuid}&contentTypes=${ContentType.COMPOSER_CHART}`,
                    )
                ).body.results.data.map((item) => item.uuid);
            expect(await listedFor(admin)).toEqual([hidden.body.results.uuid]);
            expect(await listedFor(editor)).toEqual([]);
        });

        it('MCP find_content finds a chart for a viewer of its space with its page link, not one in a space they cannot see, and none with the flag off', async () => {
            const publicSpace = await createSpace();
            const privateSpace = await createSpace(false);
            const named = async (spaceUuid: string, name: string) => {
                const created = await postChart({
                    ...composerSpaceChartBody(spaceUuid),
                    name,
                });
                expect(created.status).toBe(201);
                return created.body.results;
            };
            const shown = await named(
                publicSpace.uuid,
                uniqueName('Findable composer chart'),
            );
            const hidden = await named(
                privateSpace.uuid,
                uniqueName('Hidden composer chart'),
            );
            const viewerMcp = await openMcpSession(await loginAsViewer());
            const adminMcp = await openMcpSession(admin);
            const found = async (
                callTool: typeof adminMcp,
                name: string,
            ): Promise<string> => {
                const result = await callTool('find_content', {
                    projectUuid,
                    searchQueries: [{ label: name }],
                    spaceSlug: null,
                    verifiedOnly: false,
                });
                expect(result.isError).toBeFalsy();
                return mcpText(result);
            };
            try {
                const viewerFinds = await found(viewerMcp, shown.name);
                expect(viewerFinds).toContain(`chartUuid="${shown.uuid}"`);
                expect(viewerFinds).toMatch(
                    new RegExp(
                        `chartUuid="${shown.uuid}"[^>]*chartSource="composer"[^>]*href="[^"]*/projects/${projectUuid}/composer-charts/${shown.slug}"`,
                    ),
                );
                expect(await found(adminMcp, hidden.name)).toContain(
                    `chartUuid="${hidden.uuid}"`,
                );
                expect(await found(viewerMcp, hidden.name)).not.toContain(
                    hidden.uuid,
                );

                expect(
                    (await admin.post(flagUrl, { enabled: false })).status,
                ).toBe(200);
                try {
                    expect(await found(viewerMcp, shown.name)).not.toContain(
                        shown.uuid,
                    );
                } finally {
                    expect(
                        (await admin.post(flagUrl, { enabled: true })).status,
                    ).toBe(200);
                }
            } finally {
                for (const { client, uuid } of personalAccessTokens.splice(0)) {
                    await client.delete(
                        `/api/v1/user/me/personal-access-tokens/${uuid}`,
                    );
                }
            }
        });

        it('renames a chart its space owns through MCP edit_content without a new version, and refuses an editor who can only view the space', async () => {
            const privateSpace = await createSpace(false);
            const created = await postChart(
                composerSpaceChartBody(privateSpace.uuid),
            );
            expect(created.status).toBe(201);
            const chart = created.body.results;
            const shareUrl = `/api/v1/projects/${projectUuid}/spaces/${privateSpace.uuid}/share`;
            expect(
                (
                    await admin.post(shareUrl, {
                        userUuid: SEED_ORG_1_EDITOR.user_uuid,
                        spaceRole: 'viewer',
                    })
                ).status,
            ).toBe(200);
            const editorMcp = await openMcpSession(await loginAsEditor());
            const adminMcp = await openMcpSession(admin);
            const rename = (callTool: typeof adminMcp, name: string) =>
                callTool('edit_content', {
                    projectUuid,
                    type: 'composer_chart',
                    slug: chart.slug,
                    patch: [{ op: 'replace', path: '/name', value: name }],
                });
            const stored = async () =>
                (
                    await admin.get<Body<ComposerChart>>(
                        `${chartsUrl}/${chart.uuid}`,
                    )
                ).body.results;
            try {
                const refused = await rename(editorMcp, 'Renamed by editor');
                expect(mcpText(refused)).toContain(
                    "You don't have permission to save composer charts here",
                );
                expect(await stored()).toMatchObject({
                    name: chart.name,
                    versionUuid: chart.versionUuid,
                });

                const renamed = await rename(adminMcp, 'Renamed through MCP');
                expect(mcpText(renamed)).toContain(
                    '"name": "Renamed through MCP"',
                );
                expect(await stored()).toMatchObject({
                    name: 'Renamed through MCP',
                    versionUuid: chart.versionUuid,
                    owner: chart.owner,
                });
            } finally {
                for (const { client, uuid } of personalAccessTokens.splice(0)) {
                    await client.delete(
                        `/api/v1/user/me/personal-access-tokens/${uuid}`,
                    );
                }
                expect(
                    (
                        await admin.delete(
                            `${shareUrl}/${SEED_ORG_1_EDITOR.user_uuid}`,
                        )
                    ).status,
                ).toBe(200);
            }
        });

        it('creates a chart the space owns, which a viewer of the space reads and no one from another organization', async () => {
            const { space, chart } = await createSpaceChart();
            expect(chart).toMatchObject({
                projectUuid,
                owner: { type: 'space', spaceUuid: space.uuid },
                pipeline: composerSpaceChartBody(space.uuid).pipeline,
            });

            const viewer = await loginAsViewer();
            const read = await viewer.get<Body<ComposerChart>>(
                `${chartsUrl}/${chart.uuid}`,
            );
            expect(read.status).toBe(200);
            expect(read.body.results.owner).toEqual({
                type: 'space',
                spaceUuid: space.uuid,
            });

            const outsider = await anotherLogin();
            const refused = await outsider.get(`${chartsUrl}/${chart.uuid}`, {
                failOnStatusCode: false,
            });
            expect(refused.status).toBe(403);
        });

        it('keeps a named dashboard as the owner and ignores the space', async () => {
            const dashboard = await createDashboard();
            const space = await createSpace();
            const created = await postChart({
                ...composerChartBody(dashboard.uuid),
                spaceUuid: space.uuid,
            });
            expect(created.status).toBe(201);
            expect(created.body.results.owner).toEqual({
                type: 'dashboard',
                dashboardUuid: dashboard.uuid,
            });
        });

        it('refuses a create naming no owner, a malformed dashboard, a malformed, missing or deleted space', async () => {
            const { dashboardUuid: _, ...noOwner } = composerChartBody('');
            expect((await postChart(noOwner)).status).toBe(400);
            expect(
                (
                    await postChart({
                        ...noOwner,
                        dashboardUuid: null,
                        spaceUuid: null,
                    })
                ).status,
            ).toBe(400);
            expect(
                (await postChart(composerSpaceChartBody(randomUUID()))).status,
            ).toBe(404);
            expect(
                (await postChart(composerSpaceChartBody('not-a-uuid'))).status,
            ).toBe(400);
            const space = await createSpace();
            expect(
                (
                    await postChart({
                        ...composerSpaceChartBody(space.uuid),
                        dashboardUuid: '',
                    })
                ).status,
            ).toBe(400);
            expect(
                (
                    await postChart({
                        ...composerSpaceChartBody(space.uuid),
                        dashboardUuid: 'not-a-uuid',
                    })
                ).status,
            ).toBe(400);

            const deleted = await createSpace();
            expect(
                (
                    await admin.delete(
                        `/api/v1/projects/${projectUuid}/spaces/${deleted.uuid}`,
                    )
                ).status,
            ).toBe(200);
            expect(
                (await postChart(composerSpaceChartBody(deleted.uuid))).status,
            ).toBe(404);
        });

        it('refuses a project viewer, and an editor in a space they cannot see, creating', async () => {
            const space = await createSpace();
            const viewer = await loginAsViewer();
            expect(
                (await postChart(composerSpaceChartBody(space.uuid), viewer))
                    .status,
            ).toBe(403);

            const privateSpace = await createSpace(false);
            const editor = await loginAsEditor();
            expect(
                (
                    await postChart(
                        composerSpaceChartBody(privateSpace.uuid),
                        editor,
                    )
                ).status,
            ).toBe(403);
            expect(
                (await postChart(composerSpaceChartBody(space.uuid), editor))
                    .status,
            ).toBe(201);
        });

        it('opens by uuid or slug with its space and last editor, for its page', async () => {
            const { space, chart } = await createSpaceChart();
            const viewer = await loginAsViewer();
            const bySlug = await viewer.get<Body<ComposerChartWithDetails>>(
                `${chartsUrl}/${chart.slug}`,
            );
            expect(bySlug.status).toBe(200);
            expect(bySlug.body.results).toMatchObject({
                uuid: chart.uuid,
                space: { uuid: space.uuid, name: space.name },
                updatedByUser: { firstName: expect.any(String) },
            });
            const byUuid = await viewer.get<Body<ComposerChartWithDetails>>(
                `${chartsUrl}/${chart.uuid}`,
            );
            expect(byUuid.body.results).toEqual(bySlug.body.results);

            const unknown = await viewer.get(
                `${chartsUrl}/${uniqueName('no-such-chart')}`,
                { failOnStatusCode: false },
            );
            expect(unknown.status).toBe(404);
        });

        it('opens a chart whose slug looks like a uuid by that slug, and by its uuid', async () => {
            const space = await createSpace();
            const name = randomUUID();
            const created = await postChart({
                ...composerSpaceChartBody(space.uuid),
                name,
            });
            expect(created.status).toBe(201);
            const chart = created.body.results;
            expect(chart.slug).toBe(name);

            const viewer = await loginAsViewer();
            for (const id of [chart.slug, chart.uuid]) {
                const read = await viewer.get<Body<ComposerChartWithDetails>>(
                    `${chartsUrl}/${id}`,
                );
                expect(read.status).toBe(200);
                expect(read.body.results.uuid).toBe(chart.uuid);
            }
        });

        it("never gives a chart another chart's uuid as its slug", async () => {
            const { space, chart: first } = await createSpaceChart();
            const created = await postChart({
                ...composerSpaceChartBody(space.uuid),
                name: first.uuid,
            });
            expect(created.status).toBe(201);
            const second = created.body.results;
            expect(second.slug).not.toBe(first.uuid);

            const bySlug = await admin.get<Body<ComposerChartWithDetails>>(
                `${chartsUrl}/${second.slug}`,
            );
            expect(bySlug.body.results.uuid).toBe(second.uuid);
        });

        it("lists the parameters its nodes reference for the page's parameter bar", async () => {
            const { chart } = await createSpaceChart({
                pipeline: {
                    schemaVersion: 1,
                    terminalNodeId: 'tagged',
                    nodes: [
                        {
                            sourceType: QuerySourceType.SEMANTIC_LAYER,
                            nodeId: 'dates',
                            title: 'Dates',
                            exploreName: 'orders',
                            dimensions: ['orders_date_custom_param_test'],
                            metrics: ['orders_unique_order_count'],
                        },
                        {
                            sourceType: QuerySourceType.DUCKDB,
                            nodeId: 'tagged',
                            title: 'Tagged',
                            // eslint-disable-next-line no-template-curly-in-string
                            sql: 'SELECT ${lightdash.parameters.currency} AS currency, count(*) AS n FROM dates',
                            references: ['dates'],
                        },
                    ],
                },
                chart: {
                    schemaVersion: 1,
                    columns: [
                        {
                            reference: 'currency',
                            fieldType: FieldType.DIMENSION,
                        },
                        { reference: 'n', fieldType: FieldType.METRIC },
                    ],
                    chartConfig: { type: ChartType.TABLE, config: {} },
                    pivotConfig: null,
                    tableConfig: { columnOrder: ['currency', 'n'] },
                },
            });
            const viewer = await loginAsViewer();
            const resp = await viewer.get<Body<ComposerChartParameters>>(
                `${chartsUrl}/${chart.uuid}/parameters`,
            );
            expect(resp.status).toBe(200);
            expect([...resp.body.results.parameterReferences].sort()).toEqual([
                'currency',
                'date_custom_parameter',
            ]);
            expect(resp.body.results.parameterDefinitions).toMatchObject({
                currency: { label: 'Currency', default: 'usd' },
                date_custom_parameter: { label: 'A custom date parameter' },
            });

            const outsider = await anotherLogin();
            const refused = await outsider.get(
                `${chartsUrl}/${chart.uuid}/parameters`,
                { failOnStatusCode: false },
            );
            expect(refused.status).toBe(403);
        });

        it('refuses an editor reading a chart in a space they cannot see', async () => {
            const privateSpace = await createSpace(false);
            const hidden = await postChart(
                composerSpaceChartBody(privateSpace.uuid),
            );
            expect(hidden.status).toBe(201);
            const editor = await loginAsEditor();
            const read = await editor.get(
                `${chartsUrl}/${hidden.body.results.uuid}`,
                { failOnStatusCode: false },
            );
            expect(read.status).toBe(403);
        });

        it('refuses a create with the flag off while an existing chart still reads and runs', async () => {
            const { space, chart } = await createSpaceChart();
            expect((await admin.post(flagUrl, { enabled: false })).status).toBe(
                200,
            );
            try {
                const refused = await postChart(
                    composerSpaceChartBody(space.uuid),
                );
                expect(refused.status).toBe(403);
                expect(refused.body.error.data?.featureFlagId).toBe(
                    FeatureFlags.ComposerCharts,
                );
                expect((await getChart(chart.uuid)).status).toBe(200);
                expect(
                    (
                        await runChart(admin, {
                            composerChartUuid: chart.uuid,
                            invalidateCache: false,
                        })
                    ).status,
                ).toBe(200);
            } finally {
                expect(
                    (await admin.post(flagUrl, { enabled: true })).status,
                ).toBe(200);
            }
        });

        it('runs a chart its space owns for a viewer of the space, recorded as the chart view with no dashboard', async () => {
            const { chart } = await createSpaceChart();
            const viewer = await loginAsViewer();
            const run = await runChart(viewer, {
                composerChartUuid: chart.uuid,
                invalidateCache: false,
            });
            expect(run.status).toBe(200);
            const [{ queryUuid }] = run.body.results.queries;
            expect((await pollRows(viewer, queryUuid)).length).toBeGreaterThan(
                0,
            );
            const history = await viewer.get<
                Body<{ data: QueryHistoryListItem[] }>
            >(`/api/v2/projects/${projectUuid}/query/history?pageSize=100`);
            expect(
                history.body.results.data.find(
                    (row) => row.queryUuid === queryUuid,
                ),
            ).toMatchObject({
                context: 'composerChartView',
                dashboardUuid: null,
            });

            const outsider = await anotherLogin();
            expect(
                (
                    await runChart(outsider, {
                        composerChartUuid: chart.uuid,
                        invalidateCache: false,
                    })
                ).status,
            ).toBe(403);
        });

        it('refuses an editor running a chart in a space they cannot see', async () => {
            const privateSpace = await createSpace(false);
            const hidden = await postChart(
                composerSpaceChartBody(privateSpace.uuid),
            );
            expect(hidden.status).toBe(201);
            const editor = await loginAsEditor();
            const refused = await runChart(editor, {
                composerChartUuid: hidden.body.results.uuid,
                invalidateCache: false,
            });
            expect(refused.status).toBe(403);
        });

        it("refuses a run's results to a user whose space grant is revoked after the run", async () => {
            const privateSpace = await createSpace(false);
            const created = await postChart(
                composerSpaceChartBody(privateSpace.uuid),
            );
            expect(created.status).toBe(201);
            const shareUrl = `/api/v1/projects/${projectUuid}/spaces/${privateSpace.uuid}/share`;
            const editor = await loginAsEditor();
            expect(
                (
                    await admin.post(shareUrl, {
                        userUuid: SEED_ORG_1_EDITOR.user_uuid,
                        spaceRole: 'viewer',
                    })
                ).status,
            ).toBe(200);
            let queryUuid: string;
            try {
                const run = await runChart(editor, {
                    composerChartUuid: created.body.results.uuid,
                    invalidateCache: false,
                });
                expect(run.status).toBe(200);
                [{ queryUuid }] = run.body.results.queries;
                await pollRows(editor, queryUuid);
            } finally {
                expect(
                    (
                        await admin.delete(
                            `${shareUrl}/${SEED_ORG_1_EDITOR.user_uuid}`,
                        )
                    ).status,
                ).toBe(200);
            }
            const queryUrl = `/api/v2/projects/${projectUuid}/query/${queryUuid}`;
            for (const url of [queryUrl, `${queryUrl}/results`]) {
                // eslint-disable-next-line no-await-in-loop
                const read = await editor.get(url, { failOnStatusCode: false });
                expect(read.status).toBe(403);
            }
        });

        it('refuses a chart a dashboard owns, naming its dashboard, and a request carrying dashboard state', async () => {
            const { dashboard, chart } = await createComposerDashboard(
                apiClientSend(admin),
            );
            tracker.trackDashboard(dashboard.uuid);
            const refused = await runChart(admin, {
                composerChartUuid: chart.uuid,
                invalidateCache: false,
            });
            expect(refused.status).toBe(400);
            expect(refused.body.error.message).toContain(
                `dashboard "${dashboard.name}"`,
            );

            const space = await createSpaceChart();
            const withFilters = await admin.post(
                chartRunUrl,
                {
                    composerChartUuid: space.chart.uuid,
                    invalidateCache: false,
                    dashboardFilters: {
                        dimensions: [],
                        metrics: [],
                        tableCalculations: [],
                    },
                },
                { failOnStatusCode: false },
            );
            expect(withFilters.status).toBe(400);
        });

        it("a caller's value beats a node's saved value, which beats the default; DuckDB reads caller values only", async () => {
            const { chart } = await createSpaceChart({
                pipeline: {
                    schemaVersion: 1,
                    terminalNodeId: 'tagged',
                    nodes: [
                        {
                            sourceType: QuerySourceType.SEMANTIC_LAYER,
                            nodeId: 'dates',
                            title: 'Dates',
                            exploreName: 'orders',
                            dimensions: ['orders_date_custom_param_test'],
                            metrics: ['orders_unique_order_count'],
                            // Default 2025-08-06 puts every order before it
                            parameters: {
                                date_custom_parameter: '2000-01-01',
                                currency: 'gbp',
                            },
                        },
                        {
                            sourceType: QuerySourceType.DUCKDB,
                            nodeId: 'tagged',
                            title: 'Tagged',
                            // eslint-disable-next-line no-template-curly-in-string
                            sql: 'SELECT ${lightdash.parameters.currency} AS currency, count(*) AS n FROM dates',
                            references: ['dates'],
                        },
                    ],
                },
                chart: {
                    schemaVersion: 1,
                    columns: [
                        {
                            reference: 'currency',
                            fieldType: FieldType.DIMENSION,
                        },
                        { reference: 'n', fieldType: FieldType.METRIC },
                    ],
                    chartConfig: {
                        type: ChartType.CARTESIAN,
                        config: {
                            layout: { xField: 'currency', yField: ['n'] },
                            eChartsConfig: {},
                        },
                    },
                    pivotConfig: null,
                    tableConfig: { columnOrder: [] },
                },
            });
            const viewer = await loginAsViewer();
            const rawValues = (rows: unknown[], column: string) =>
                [
                    ...new Set(
                        (
                            rows as Record<
                                string,
                                { value: { raw: unknown } }
                            >[]
                        ).map((row) => row[column]?.value.raw),
                    ),
                ].sort();
            const runWith = async (parameters?: Record<string, string>) => {
                const run = await runChart(viewer, {
                    composerChartUuid: chart.uuid,
                    invalidateCache: false,
                    ...(parameters && { parameters }),
                });
                expect(run.status).toBe(200);
                const queryOf = (nodeId: string) =>
                    run.body.results.queries.find((q) => q.nodeId === nodeId)!
                        .queryUuid;
                return {
                    dates: rawValues(
                        await pollRows(viewer, queryOf('dates')),
                        'orders_date_custom_param_test',
                    ),
                    currency: rawValues(
                        await pollRows(viewer, queryOf('tagged')),
                        'currency',
                    ),
                };
            };

            expect(await runWith()).toEqual({
                dates: ['I feel great!!!'],
                currency: ['usd'],
            });
            expect(
                await runWith({
                    date_custom_parameter: '2100-01-01',
                    currency: 'eur',
                }),
            ).toEqual({ dates: ['I feel less than...'], currency: ['eur'] });
            expect(await runWith({ currency: 'jpy' })).toEqual({
                dates: ['I feel great!!!'],
                currency: ['usd'],
            });
        });

        it('search finds a chart for viewers of its space under the Charts filter, and none with the flag off', async () => {
            const token = `ledger${randomUUID().slice(0, 8)}`;
            const create = async (space: Space) => {
                const created = await postChart({
                    ...composerSpaceChartBody(space.uuid),
                    name: `Composer ${token}`,
                });
                expect(created.status).toBe(201);
                return created.body.results;
            };
            const shared = await create(await createSpace());
            const hidden = await create(await createSpace(false));
            const search = async (client: ApiClient, type?: SearchItemType) => {
                const resp = await client.get<Body<SearchResults>>(
                    `/api/v1/projects/${projectUuid}/search/${token}${
                        type ? `?type=${type}` : ''
                    }`,
                );
                expect(resp.status).toBe(200);
                return resp.body.results.composerCharts.map(({ uuid }) => uuid);
            };

            expect((await search(admin)).sort()).toEqual(
                [shared.uuid, hidden.uuid].sort(),
            );
            const editor = await loginAsEditor();
            expect(await search(editor)).toEqual([shared.uuid]);
            expect(await search(editor, SearchItemType.CHART)).toEqual([
                shared.uuid,
            ]);
            expect(await search(editor, SearchItemType.SQL_CHART)).toEqual([]);

            expect((await admin.post(flagUrl, { enabled: false })).status).toBe(
                200,
            );
            try {
                expect(await search(admin)).toEqual([]);
            } finally {
                expect(
                    (await admin.post(flagUrl, { enabled: true })).status,
                ).toBe(200);
            }
        });

        it('downloads as code under its own space with no dashboard, and refuses the file on upload', async () => {
            const { space, chart } = await createSpaceChart();
            const codeUrl = `/api/v1/projects/${projectUuid}/code/composerCharts`;
            const download = await admin.get<
                Body<{ composerCharts: ComposerChartAsCode[] }>
            >(`${codeUrl}?ids=${chart.slug}`);
            expect(download.status).toBe(200);
            const [file] = download.body.results.composerCharts;
            expect(file).toMatchObject({
                slug: chart.slug,
                dashboardSlug: null,
                spaceSlug: getContentAsCodePathFromLtreePath(space.path),
            });

            const uploaded = await admin.post<{ error: { message: string } }>(
                `${codeUrl}/${file.slug}`,
                file,
                { failOnStatusCode: false },
            );
            expect(uploaded.status).toBe(400);
            expect(uploaded.body.error.message).toContain(
                `Composer chart "${chart.slug}" belongs to a space`,
            );
        });

        describe('rename and move', () => {
            const contentUrl = `/api/v2/content/${projectUuid}/move`;

            const rename = (
                uuid: string,
                body: unknown,
                client: ApiClient = admin,
            ) =>
                client.patch<Body<ComposerChart>>(
                    `${chartsUrl}/${uuid}`,
                    body,
                    {
                        failOnStatusCode: false,
                    },
                );

            const move = (
                uuid: string,
                targetSpaceUuid: string | null,
                client: ApiClient = admin,
            ) =>
                client.post(
                    contentUrl,
                    {
                        item: { uuid, contentType: ContentType.COMPOSER_CHART },
                        action: { type: 'move', targetSpaceUuid },
                    },
                    { failOnStatusCode: false },
                );

            const read = async (uuid: string) =>
                (await getChart(uuid)).body.results;

            it('renames with no new version and the same slug, with the flag off too', async () => {
                const { chart } = await createSpaceChart();
                const editor = await loginAsEditor();
                const renamed = await rename(
                    chart.uuid,
                    { name: 'Renamed orders', description: 'Why it matters' },
                    editor,
                );
                expect(renamed.status).toBe(200);
                expect(await read(chart.uuid)).toMatchObject({
                    name: 'Renamed orders',
                    description: 'Why it matters',
                    slug: chart.slug,
                    versionUuid: chart.versionUuid,
                });

                expect(
                    (await admin.post(flagUrl, { enabled: false })).status,
                ).toBe(200);
                try {
                    expect(
                        (await rename(chart.uuid, { description: null }))
                            .status,
                    ).toBe(200);
                } finally {
                    expect(
                        (await admin.post(flagUrl, { enabled: true })).status,
                    ).toBe(200);
                }
                expect(await read(chart.uuid)).toMatchObject({
                    name: 'Renamed orders',
                    description: null,
                    versionUuid: chart.versionUuid,
                });
            });

            it("refuses a rename by a viewer, in a space the editor cannot see, of a dashboard's chart, or to an empty name", async () => {
                const { chart } = await createSpaceChart();
                const viewer = await loginAsViewer();
                expect(
                    (await rename(chart.uuid, { name: 'No' }, viewer)).status,
                ).toBe(403);

                const privateSpace = await createSpace(false);
                const hidden = await postChart(
                    composerSpaceChartBody(privateSpace.uuid),
                );
                const editor = await loginAsEditor();
                expect(
                    (
                        await rename(
                            hidden.body.results.uuid,
                            { name: 'No' },
                            editor,
                        )
                    ).status,
                ).toBe(403);

                const dashboard = await createDashboard();
                const owned = await createChart(dashboard.uuid);
                expect((await rename(owned.uuid, { name: 'No' })).status).toBe(
                    400,
                );
                expect((await rename(chart.uuid, { name: ' ' })).status).toBe(
                    400,
                );
                expect((await read(chart.uuid)).name).toBe(chart.name);
            });

            it('moves between spaces with no new version, with the flag off too', async () => {
                const { chart } = await createSpaceChart();
                const target = await createSpace();
                const editor = await loginAsEditor();
                expect(
                    (await move(chart.uuid, target.uuid, editor)).status,
                ).toBe(200);
                expect(await read(chart.uuid)).toMatchObject({
                    owner: { type: 'space', spaceUuid: target.uuid },
                    slug: chart.slug,
                    versionUuid: chart.versionUuid,
                });

                const back = await createSpace();
                expect(
                    (await admin.post(flagUrl, { enabled: false })).status,
                ).toBe(200);
                try {
                    expect((await move(chart.uuid, back.uuid)).status).toBe(
                        200,
                    );
                } finally {
                    expect(
                        (await admin.post(flagUrl, { enabled: true })).status,
                    ).toBe(200);
                }
                expect((await read(chart.uuid)).owner).toEqual({
                    type: 'space',
                    spaceUuid: back.uuid,
                });
            });

            it("refuses a move without write on either space, to a deleted or missing space, out of every space, or of a dashboard's chart", async () => {
                const { space, chart } = await createSpaceChart();
                const target = await createSpace();
                const privateSpace = await createSpace(false);
                const editor = await loginAsEditor();
                const viewer = await loginAsViewer();

                expect(
                    (await move(chart.uuid, target.uuid, viewer)).status,
                ).toBe(403);
                expect(
                    (await move(chart.uuid, privateSpace.uuid, editor)).status,
                ).toBe(403);
                const hidden = await postChart(
                    composerSpaceChartBody(privateSpace.uuid),
                );
                expect(
                    (await move(hidden.body.results.uuid, target.uuid, editor))
                        .status,
                ).toBe(403);

                const deleted = await createSpace();
                expect(
                    (
                        await admin.delete(
                            `/api/v1/projects/${projectUuid}/spaces/${deleted.uuid}`,
                        )
                    ).status,
                ).toBe(200);
                expect((await move(chart.uuid, deleted.uuid)).status).toBe(404);
                expect((await move(chart.uuid, randomUUID())).status).toBe(404);
                expect((await move(chart.uuid, null)).status).toBe(400);

                const dashboard = await createDashboard();
                const owned = await createChart(dashboard.uuid);
                expect((await move(owned.uuid, target.uuid)).status).toBe(400);

                expect((await read(chart.uuid)).owner).toEqual({
                    type: 'space',
                    spaceUuid: space.uuid,
                });
            });

            it('bulk moves a classic chart, a SQL chart, a dashboard and a composer chart together', async () => {
                const source = await createSpace();
                const target = await createSpace();
                const classic = await admin.post<Body<{ uuid: string }>>(
                    `/api/v1/projects/${projectUuid}/saved`,
                    {
                        ...chartMock,
                        name: uniqueName('Bulk move classic'),
                        spaceUuid: source.uuid,
                        dashboardUuid: null,
                    },
                );
                expect(classic.status).toBe(200);
                tracker.trackChart(classic.body.results.uuid);
                const sql = await admin.post<Body<{ savedSqlUuid: string }>>(
                    `/api/v1/projects/${projectUuid}/sqlRunner/saved`,
                    {
                        name: uniqueName('Bulk move SQL'),
                        description: null,
                        sql: 'SELECT * FROM postgres.jaffle.payments',
                        limit: 21,
                        config: {
                            display: {},
                            metadata: { version: 1 },
                            type: ChartKind.TABLE,
                            columns: {},
                        },
                        spaceUuid: source.uuid,
                    },
                );
                expect(sql.status).toBe(200);
                const dashboard = await admin.post<Body<Dashboard>>(
                    `/api/v1/projects/${projectUuid}/dashboards`,
                    {
                        name: uniqueName('Bulk move dashboard'),
                        spaceUuid: source.uuid,
                        tiles: [],
                        tabs: [],
                    },
                );
                expect(dashboard.status).toBe(201);
                tracker.trackDashboard(dashboard.body.results.uuid);
                const composer = await postChart(
                    composerSpaceChartBody(source.uuid),
                );
                expect(composer.status).toBe(201);

                // One refused item rolls the whole bulk move back
                const privateSpace = await createSpace(false);
                const hidden = await postChart(
                    composerSpaceChartBody(privateSpace.uuid),
                );
                const editor = await loginAsEditor();
                const refused = await editor.post(
                    `/api/v2/content/bulk-action/${projectUuid}/move`,
                    {
                        content: [
                            {
                                uuid: classic.body.results.uuid,
                                contentType: ContentType.CHART,
                                source: ChartSourceType.DBT_EXPLORE,
                            },
                            {
                                uuid: hidden.body.results.uuid,
                                contentType: ContentType.COMPOSER_CHART,
                            },
                        ],
                        action: { type: 'move', targetSpaceUuid: target.uuid },
                    },
                    { failOnStatusCode: false },
                );
                expect(refused.status).toBe(403);
                const unmoved = await admin.get<Body<{ spaceUuid: string }>>(
                    `/api/v1/saved/${classic.body.results.uuid}`,
                );
                expect(unmoved.body.results.spaceUuid).toBe(source.uuid);

                const moved = await admin.post(
                    `/api/v2/content/bulk-action/${projectUuid}/move`,
                    {
                        content: [
                            {
                                uuid: classic.body.results.uuid,
                                contentType: ContentType.CHART,
                                source: ChartSourceType.DBT_EXPLORE,
                            },
                            {
                                uuid: sql.body.results.savedSqlUuid,
                                contentType: ContentType.CHART,
                                source: ChartSourceType.SQL,
                            },
                            {
                                uuid: dashboard.body.results.uuid,
                                contentType: ContentType.DASHBOARD,
                            },
                            {
                                uuid: composer.body.results.uuid,
                                contentType: ContentType.COMPOSER_CHART,
                            },
                        ],
                        action: { type: 'move', targetSpaceUuid: target.uuid },
                    },
                );
                expect(moved.status).toBe(200);

                const listed = async (spaceUuid: string) =>
                    (
                        await admin.get<Body<{ data: SummaryContent[] }>>(
                            `/api/v2/content?projectUuids=${projectUuid}&spaceUuids=${spaceUuid}&contentTypes=${ContentType.CHART}&contentTypes=${ContentType.DASHBOARD}&contentTypes=${ContentType.COMPOSER_CHART}&pageSize=100`,
                        )
                    ).body.results.data.map((item) => item.uuid);
                expect((await listed(target.uuid)).sort()).toEqual(
                    [
                        classic.body.results.uuid,
                        sql.body.results.savedSqlUuid,
                        dashboard.body.results.uuid,
                        composer.body.results.uuid,
                    ].sort(),
                );
                expect(await listed(source.uuid)).toEqual([]);
            });
        });

        describe('delete', () => {
            const deleteChart = (uuid: string, client: ApiClient = admin) =>
                client.delete(`${chartsUrl}/${uuid}`, {
                    failOnStatusCode: false,
                });

            const dashboardsShowing = (
                uuid: string,
                client: ApiClient = admin,
            ) =>
                client.get<Body<ComposerChartDashboard[]>>(
                    `${chartsUrl}/${uuid}/dashboards`,
                    { failOnStatusCode: false },
                );

            const listedIn = async (spaceUuid: string) =>
                (
                    await admin.get<Body<{ data: SummaryContent[] }>>(
                        `/api/v2/content?projectUuids=${projectUuid}&spaceUuids=${spaceUuid}&contentTypes=${ContentType.COMPOSER_CHART}&pageSize=100`,
                    )
                ).body.results.data.map((item) => item.uuid);

            it('deletes a chart its space owns, with the flag off too, so it no longer reads, runs or lists', async () => {
                const { space, chart } = await createSpaceChart();
                const second = await postChart(
                    composerSpaceChartBody(space.uuid),
                );
                expect(second.status).toBe(201);
                const editor = await loginAsEditor();

                const viaContent = await editor.post(
                    `/api/v2/content/${projectUuid}/delete`,
                    {
                        item: {
                            uuid: chart.uuid,
                            contentType: ContentType.COMPOSER_CHART,
                        },
                        action: { type: 'delete' },
                    },
                    { failOnStatusCode: false },
                );
                expect(viaContent.status).toBe(200);
                expect((await getChart(chart.uuid)).status).toBe(404);
                expect(
                    (
                        await runChart(admin, {
                            composerChartUuid: chart.uuid,
                            invalidateCache: false,
                        })
                    ).status,
                ).toBe(404);
                expect((await deleteChart(chart.uuid)).status).toBe(404);
                expect(await listedIn(space.uuid)).toEqual([
                    second.body.results.uuid,
                ]);

                expect(
                    (await admin.post(flagUrl, { enabled: false })).status,
                ).toBe(200);
                try {
                    expect(
                        (await deleteChart(second.body.results.uuid, editor))
                            .status,
                    ).toBe(200);
                } finally {
                    expect(
                        (await admin.post(flagUrl, { enabled: true })).status,
                    ).toBe(200);
                }
                expect((await getChart(second.body.results.uuid)).status).toBe(
                    404,
                );
            });

            it("refuses a delete by a viewer, in a space the editor cannot see, or of a dashboard's chart", async () => {
                const { chart } = await createSpaceChart();
                const viewer = await loginAsViewer();
                expect((await deleteChart(chart.uuid, viewer)).status).toBe(
                    403,
                );

                const privateSpace = await createSpace(false);
                const hidden = await postChart(
                    composerSpaceChartBody(privateSpace.uuid),
                );
                const editor = await loginAsEditor();
                expect(
                    (await deleteChart(hidden.body.results.uuid, editor))
                        .status,
                ).toBe(403);

                const dashboard = await createDashboard();
                const owned = await createChart(dashboard.uuid);
                expect((await deleteChart(owned.uuid)).status).toBe(400);

                expect((await getChart(chart.uuid)).status).toBe(200);
                expect((await getChart(hidden.body.results.uuid)).status).toBe(
                    200,
                );
                expect((await getChart(owned.uuid)).status).toBe(200);
            });

            it('names the dashboards showing a chart to those who can view it', async () => {
                const { chart } = await createSpaceChart();
                const listed = await dashboardsShowing(chart.uuid);
                expect(listed.status).toBe(200);
                expect(listed.body.results).toEqual([]);

                const dashboard = await createDashboard();
                const owned = await createChart(dashboard.uuid);
                expect(
                    (await addComposerTile(dashboard, owned.uuid)).status,
                ).toBe(200);
                expect(
                    (await dashboardsShowing(owned.uuid)).body.results,
                ).toEqual([{ uuid: dashboard.uuid, name: dashboard.name }]);

                const privateSpace = await createSpace(false);
                const hidden = await postChart(
                    composerSpaceChartBody(privateSpace.uuid),
                );
                const editor = await loginAsEditor();
                expect(
                    (await dashboardsShowing(hidden.body.results.uuid, editor))
                        .status,
                ).toBe(403);
            });

            it('bulk deletes what the user may delete, a composer chart among them, and skips the rest', async () => {
                const open = await createSpace();
                const privateSpace = await createSpace(false);
                const classicIn = async (spaceUuid: string) => {
                    const resp = await admin.post<Body<{ uuid: string }>>(
                        `/api/v1/projects/${projectUuid}/saved`,
                        {
                            ...chartMock,
                            name: uniqueName('Bulk delete classic'),
                            spaceUuid,
                            dashboardUuid: null,
                        },
                    );
                    expect(resp.status).toBe(200);
                    tracker.trackChart(resp.body.results.uuid);
                    return resp.body.results.uuid;
                };
                const classic = await classicIn(open.uuid);
                const hiddenClassic = await classicIn(privateSpace.uuid);
                const sql = await admin.post<Body<{ savedSqlUuid: string }>>(
                    `/api/v1/projects/${projectUuid}/sqlRunner/saved`,
                    {
                        name: uniqueName('Bulk delete SQL'),
                        description: null,
                        sql: 'SELECT * FROM postgres.jaffle.payments',
                        limit: 21,
                        config: {
                            display: {},
                            metadata: { version: 1 },
                            type: ChartKind.TABLE,
                            columns: {},
                        },
                        spaceUuid: open.uuid,
                    },
                );
                expect(sql.status).toBe(200);
                const dashboard = await admin.post<Body<Dashboard>>(
                    `/api/v1/projects/${projectUuid}/dashboards`,
                    {
                        name: uniqueName('Bulk delete dashboard'),
                        spaceUuid: open.uuid,
                        tiles: [],
                        tabs: [],
                    },
                );
                expect(dashboard.status).toBe(201);
                tracker.trackDashboard(dashboard.body.results.uuid);
                const composer = await postChart(
                    composerSpaceChartBody(open.uuid),
                );
                expect(composer.status).toBe(201);
                const hiddenComposer = await postChart(
                    composerSpaceChartBody(privateSpace.uuid),
                );
                expect(hiddenComposer.status).toBe(201);
                const owningDashboard = await createDashboard();
                const owned = await createChart(owningDashboard.uuid);

                const editor = await loginAsEditor();
                const resp = await editor.post<Body<ContentBulkDeleteResults>>(
                    `/api/v2/content/bulk-action/${projectUuid}/delete`,
                    {
                        content: [
                            {
                                uuid: classic,
                                contentType: ContentType.CHART,
                                source: ChartSourceType.DBT_EXPLORE,
                            },
                            {
                                uuid: hiddenComposer.body.results.uuid,
                                contentType: ContentType.COMPOSER_CHART,
                            },
                            {
                                uuid: sql.body.results.savedSqlUuid,
                                contentType: ContentType.CHART,
                                source: ChartSourceType.SQL,
                            },
                            {
                                uuid: hiddenClassic,
                                contentType: ContentType.CHART,
                                source: ChartSourceType.DBT_EXPLORE,
                            },
                            {
                                uuid: dashboard.body.results.uuid,
                                contentType: ContentType.DASHBOARD,
                            },
                            {
                                uuid: owned.uuid,
                                contentType: ContentType.COMPOSER_CHART,
                            },
                            {
                                uuid: composer.body.results.uuid,
                                contentType: ContentType.COMPOSER_CHART,
                            },
                        ],
                        action: { type: 'delete' },
                    },
                );
                expect(resp.status).toBe(200);
                expect(resp.body.results.deletedCount).toBe(4);
                expect(resp.body.results.skipped).toEqual([
                    {
                        uuid: hiddenComposer.body.results.uuid,
                        contentType: ContentType.COMPOSER_CHART,
                        reason: 'You do not have permission to delete this content',
                    },
                    {
                        uuid: hiddenClassic,
                        contentType: ContentType.CHART,
                        reason: 'You do not have permission to delete this content',
                    },
                    {
                        uuid: owned.uuid,
                        contentType: ContentType.COMPOSER_CHART,
                        reason: 'This composer chart belongs to a dashboard. Change it from that dashboard.',
                    },
                ]);

                const status = async (url: string) =>
                    (await admin.get(url, { failOnStatusCode: false })).status;
                expect(await status(`/api/v1/saved/${classic}`)).toBe(404);
                expect(
                    await status(
                        `/api/v1/projects/${projectUuid}/sqlRunner/saved/${sql.body.results.savedSqlUuid}`,
                    ),
                ).toBe(404);
                expect(
                    await status(
                        `/api/v1/dashboards/${dashboard.body.results.uuid}`,
                    ),
                ).toBe(404);
                expect(
                    await status(`${chartsUrl}/${composer.body.results.uuid}`),
                ).toBe(404);
                expect(await status(`/api/v1/saved/${hiddenClassic}`)).toBe(
                    200,
                );
                expect(
                    await status(
                        `${chartsUrl}/${hiddenComposer.body.results.uuid}`,
                    ),
                ).toBe(200);
                expect(await status(`${chartsUrl}/${owned.uuid}`)).toBe(200);
            });
        });

        // Skipped when SOFT_DELETE_ENABLED is off (delete is permanent)
        describe('restore and permanent delete', () => {
            const skipWithoutSoftDelete = async (ctx: { skip: () => void }) => {
                const health =
                    await admin.get<Body<{ softDelete: { enabled: boolean } }>>(
                        '/api/v1/health',
                    );
                if (!health.body.results.softDelete.enabled) {
                    // oxlint-disable-next-line vitest-js/no-disabled-tests -- runtime skip when soft delete is disabled on the server
                    ctx.skip();
                }
            };

            const withFlagOff = async (act: () => Promise<void>) => {
                expect(
                    (await admin.post(flagUrl, { enabled: false })).status,
                ).toBe(200);
                try {
                    expect(
                        (await admin.get<Body<{ enabled: boolean }>>(flagUrl))
                            .body.results.enabled,
                    ).toBe(false);
                    await act();
                } finally {
                    expect(
                        (await admin.post(flagUrl, { enabled: true })).status,
                    ).toBe(200);
                }
            };

            const composerItem = (uuid: string) => ({
                uuid,
                contentType: ContentType.COMPOSER_CHART,
            });

            const restore = (uuid: string, client: ApiClient = admin) =>
                client.post<Body<undefined> & { error: { message: string } }>(
                    `/api/v2/content/${projectUuid}/restore`,
                    { item: composerItem(uuid) },
                    { failOnStatusCode: false },
                );

            const permanentlyDelete = (
                uuid: string,
                client: ApiClient = admin,
            ) =>
                client.delete(`/api/v2/content/${projectUuid}/permanent`, {
                    body: { item: composerItem(uuid) },
                    failOnStatusCode: false,
                });

            const deleteChart = (uuid: string, client: ApiClient = admin) =>
                client.delete(`${chartsUrl}/${uuid}`, {
                    failOnStatusCode: false,
                });

            const recentlyDeleted = async (client: ApiClient = admin) =>
                (
                    await client.get<ApiDeletedContentResponse>(
                        `/api/v2/content/deleted?projectUuids=${projectUuid}&contentTypes=${ContentType.CHART}&contentTypes=${ContentType.COMPOSER_CHART}&pageSize=100`,
                    )
                ).body.results.data;

            it('lists a deleted chart under Charts for its deleter, who restores it', async (ctx) => {
                await skipWithoutSoftDelete(ctx);
                const { space, chart } = await createSpaceChart();
                const editor = await loginAsEditor();
                expect((await deleteChart(chart.uuid, editor)).status).toBe(
                    200,
                );

                expect(
                    (await recentlyDeleted(editor)).find(
                        (item) => item.uuid === chart.uuid,
                    ),
                ).toMatchObject({
                    contentType: ContentType.COMPOSER_CHART,
                    spaceUuid: space.uuid,
                    deletedBy: { userUuid: SEED_ORG_1_EDITOR.user_uuid },
                });

                expect((await restore(chart.uuid, editor)).status).toBe(200);
                expect((await getChart(chart.uuid)).status).toBe(200);
                expect(
                    (await recentlyDeleted()).map((item) => item.uuid),
                ).not.toContain(chart.uuid);
                expect((await restore(chart.uuid)).status).toBe(404);
            });

            it('lets anyone who manages deleted content restore it, with the flag off too, and no one else', async (ctx) => {
                await skipWithoutSoftDelete(ctx);
                const { chart } = await createSpaceChart();
                const editor = await loginAsEditor();
                expect((await deleteChart(chart.uuid, editor)).status).toBe(
                    200,
                );
                const viewer = await loginAsViewer();
                expect((await restore(chart.uuid, viewer)).status).toBe(403);
                expect(
                    (await permanentlyDelete(chart.uuid, viewer)).status,
                ).toBe(403);
                await withFlagOff(async () => {
                    expect((await restore(chart.uuid)).status).toBe(200);
                });
                expect((await getChart(chart.uuid)).status).toBe(200);
            });

            it('refuses a restore into a deleted space with 409 until the space is back', async (ctx) => {
                await skipWithoutSoftDelete(ctx);
                const { space, chart } = await createSpaceChart();
                expect((await deleteChart(chart.uuid)).status).toBe(200);
                expect(
                    (
                        await admin.delete(
                            `/api/v1/projects/${projectUuid}/spaces/${space.uuid}`,
                        )
                    ).status,
                ).toBe(200);

                const refused = await restore(chart.uuid);
                expect(refused.status).toBe(409);
                expect(refused.body.error.message).toContain(
                    'Restore the space first',
                );

                expect(
                    (
                        await admin.post(
                            `/api/v2/content/${projectUuid}/restore`,
                            {
                                item: {
                                    uuid: space.uuid,
                                    contentType: ContentType.SPACE,
                                },
                            },
                        )
                    ).status,
                ).toBe(200);
                // Deleted before its space, so the space's restore leaves it deleted
                expect((await getChart(chart.uuid)).status).toBe(404);
                expect((await restore(chart.uuid)).status).toBe(200);
                expect((await getChart(chart.uuid)).status).toBe(200);
            });

            it("takes a space's composer, classic and SQL charts and dashboards with it, and restores them all", async (ctx) => {
                await skipWithoutSoftDelete(ctx);
                const { space, chart } = await createSpaceChart();
                const classic = await admin.post<Body<{ uuid: string }>>(
                    `/api/v1/projects/${projectUuid}/saved`,
                    {
                        ...chartMock,
                        name: uniqueName('Cascade classic'),
                        spaceUuid: space.uuid,
                        dashboardUuid: null,
                    },
                );
                expect(classic.status).toBe(200);
                const sql = await admin.post<Body<{ savedSqlUuid: string }>>(
                    `/api/v1/projects/${projectUuid}/sqlRunner/saved`,
                    {
                        name: uniqueName('Cascade SQL'),
                        description: null,
                        sql: 'SELECT * FROM postgres.jaffle.payments',
                        limit: 21,
                        config: {
                            display: {},
                            metadata: { version: 1 },
                            type: ChartKind.TABLE,
                            columns: {},
                        },
                        spaceUuid: space.uuid,
                    },
                );
                expect(sql.status).toBe(200);
                const dashboard = await admin.post<Body<Dashboard>>(
                    `/api/v1/projects/${projectUuid}/dashboards`,
                    {
                        name: uniqueName('Cascade dashboard'),
                        spaceUuid: space.uuid,
                        tiles: [],
                        tabs: [],
                    },
                );
                expect(dashboard.status).toBe(201);
                const urls = [
                    `${chartsUrl}/${chart.uuid}`,
                    `/api/v1/saved/${classic.body.results.uuid}`,
                    `/api/v1/projects/${projectUuid}/sqlRunner/saved/${sql.body.results.savedSqlUuid}`,
                    `/api/v1/dashboards/${dashboard.body.results.uuid}`,
                ];
                const statuses = () =>
                    Promise.all(
                        urls.map(
                            async (url) =>
                                (
                                    await admin.get(url, {
                                        failOnStatusCode: false,
                                    })
                                ).status,
                        ),
                    );

                const editor = await loginAsEditor();
                expect(
                    (
                        await editor.delete(
                            `/api/v1/projects/${projectUuid}/spaces/${space.uuid}`,
                        )
                    ).status,
                ).toBe(200);
                // A SQL chart stays live but is refused in its deleted space
                expect(await statuses()).toEqual([404, 404, 403, 404]);
                // Listed through its space, not on its own
                expect(
                    (await recentlyDeleted(editor)).map((item) => item.uuid),
                ).not.toContain(chart.uuid);

                expect(
                    (
                        await editor.post(
                            `/api/v2/content/${projectUuid}/restore`,
                            {
                                item: {
                                    uuid: space.uuid,
                                    contentType: ContentType.SPACE,
                                },
                            },
                        )
                    ).status,
                ).toBe(200);
                expect(await statuses()).toEqual([200, 200, 200, 200]);
            });

            it('permanently deletes a deleted chart for good, with the flag off too, and refuses a live or dashboard-owned one', async (ctx) => {
                await skipWithoutSoftDelete(ctx);
                const { chart } = await createSpaceChart();
                expect((await permanentlyDelete(chart.uuid)).status).toBe(404);
                const editor = await loginAsEditor();
                expect((await deleteChart(chart.uuid, editor)).status).toBe(
                    200,
                );
                await withFlagOff(async () => {
                    expect(
                        (await permanentlyDelete(chart.uuid, editor)).status,
                    ).toBe(200);
                });
                expect((await restore(chart.uuid)).status).toBe(404);
                expect(
                    (await recentlyDeleted()).map((item) => item.uuid),
                ).not.toContain(chart.uuid);

                const dashboard = await createDashboard();
                const owned = await createChart(dashboard.uuid);
                expect(
                    (await admin.delete(`/api/v1/dashboards/${dashboard.uuid}`))
                        .status,
                ).toBe(200);
                expect((await restore(owned.uuid)).status).toBe(400);
                expect((await permanentlyDelete(owned.uuid)).status).toBe(400);
            });
        });
    });
});
