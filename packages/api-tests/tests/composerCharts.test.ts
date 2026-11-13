import {
    ChartType,
    DashboardTileTypes,
    FeatureFlags,
    FieldType,
    FilterOperator,
    MergeJoinType,
    QuerySourceType,
    SEED_DATA_APP_VIZ,
    SEED_PROJECT,
    ServiceAccountScope,
    type ComposerChart,
    type ComposerChartAsCode,
    type ComposerChartPipeline,
    type ComposerChartRunRequest,
    type ComposerChartRunResults,
    type CreateComposerChart,
    type Dashboard,
    type DashboardAsCode,
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
    composerTile as composerTileFor,
    createComposerDashboard,
} from '../helpers/composerDashboard';
import { TestResourceTracker, uniqueName } from '../helpers/test-isolation';

const projectUuid = SEED_PROJECT.project_uuid;
const chartsUrl = `/api/v2/projects/${projectUuid}/composer-charts`;
const flagUrl = `/api/v2/feature-flag/${FeatureFlags.ComposerCharts}`;

const runRequest = (
    dashboardUuid: string,
    tileUuid: string,
): ComposerChartRunRequest => ({
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

    const runUrl = (composerChartUuid: string) =>
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
            dashboardUuid: dashboard.uuid,
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
                dashboardUuid: copy.uuid,
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

        it('deletes the chart with its dashboard', async () => {
            const { dashboard, chart } = await createDashboardWithSqlChart();

            const deleted = await admin.delete(
                `/api/v1/dashboards/${dashboard.uuid}`,
            );
            expect(deleted.status).toBe(200);

            expect((await getChart(chart.uuid)).status).toBe(404);
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
                runUrl(chart.uuid),
                runRequest(dashboard.uuid, tileUuid),
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
                runUrl(chart.uuid),
                {
                    ...runRequest(dashboard.uuid, tileUuid),
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
                runUrl(other.chart.uuid),
                runRequest(dashboard.uuid, tileUuid),
                { failOnStatusCode: false },
            );
            expect(otherChart.status).toBe(403);
        });

        it('refuses a run from another organization', async () => {
            const { dashboard, chart, tileUuid } =
                await createRunnableDashboard();
            const outsider = await anotherLogin();
            const refused = await outsider.post(
                runUrl(chart.uuid),
                runRequest(dashboard.uuid, tileUuid),
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
                runUrl(chart.uuid),
                runRequest(dashboard.uuid, dashboard.tiles[0].uuid),
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
                runUrl(chart.uuid),
                runRequest(dashboard.uuid, dashboard.tiles[0].uuid),
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
                runUrl(chart.uuid),
                runRequest(dashboard.uuid, dashboard.tiles[0].uuid),
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
                }>(runUrl(chart.uuid), runRequest(dashboard.uuid, tileUuid), {
                    failOnStatusCode: false,
                });
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
                dashboardUuid: dashboard.uuid,
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
            tracker.trackDashboard(stored.dashboardUuid);
            const placeholder = await getDashboard(stored.dashboardUuid);
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
                dashboardUuid: dashboard.uuid,
                chart: { pivotConfig: { columns: ['orders_status'] } },
            });
            // A group-by round-trips like any other chart
            const again = await uploadChart(await downloadChart(chart.slug));
            expect(again.body.results.action).toBe('no changes');
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
            expect(refused.body.error.message).toContain('Upgrade your CLI');
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
});
