import {
    ChartType,
    DashboardTileTypes,
    FeatureFlags,
    FieldType,
    FilterOperator,
    MergeJoinType,
    QuerySourceType,
    SEED_PROJECT,
    type ComposerChart,
    type ComposerChartPipeline,
    type ComposerChartRunRequest,
    type ComposerChartRunResults,
    type CreateComposerChart,
    type Dashboard,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiClient, type Body } from '../helpers/api-client';
import {
    anotherLogin,
    login,
    loginAsEditor,
    loginAsViewer,
} from '../helpers/auth';
import { TestResourceTracker, uniqueName } from '../helpers/test-isolation';

const projectUuid = SEED_PROJECT.project_uuid;
const chartsUrl = `/api/v2/projects/${projectUuid}/composer-charts`;
const flagUrl = `/api/v2/feature-flag/${FeatureFlags.ComposerCharts}`;

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

const composerChartBody = (dashboardUuid: string): CreateComposerChart => ({
    dashboardUuid,
    name: 'Orders by status',
    description: null,
    pipeline: {
        schemaVersion: 1,
        terminalNodeId: 'orders',
        nodes: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'orders',
                title: 'Orders by status',
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_total_order_amount'],
            },
        ],
    },
    chart: {
        schemaVersion: 1,
        columns: [
            { reference: 'orders_status', fieldType: FieldType.DIMENSION },
            {
                reference: 'orders_total_order_amount',
                fieldType: FieldType.METRIC,
            },
        ],
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'orders_status',
                    yField: ['orders_total_order_amount'],
                },
                eChartsConfig: {},
            },
        },
        pivotConfig: null,
        tableConfig: {
            columnOrder: ['orders_status', 'orders_total_order_amount'],
        },
    },
});

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
                tiles: [
                    {
                        uuid: randomUUID(),
                        type: DashboardTileTypes.COMPOSER_CHART,
                        x: 0,
                        y: 0,
                        h: 9,
                        w: 12,
                        tabUuid: null,
                        properties: {
                            title: 'Orders',
                            composerChartUuid,
                            chartName: null,
                        },
                    },
                ],
                filters: dashboard.filters,
                tabs: dashboard.tabs,
            },
            { failOnStatusCode: false },
        );

    const createDashboardWithSqlChart = async () => {
        const dashboard = await createDashboard();
        const resp = await admin.post<Body<ComposerChart>>(chartsUrl, {
            ...composerChartBody(dashboard.uuid),
            pipeline: sqlPipeline,
        });
        expect(resp.status).toBe(201);
        const updated = await addComposerTile(
            dashboard,
            resp.body.results.uuid,
        );
        expect(updated.status).toBe(200);
        return { dashboard: updated.body.results, chart: resp.body.results };
    };

    const runUrl = (composerChartUuid: string) =>
        `${chartsUrl}/${composerChartUuid}/run`;

    /** A dashboard holding one composer tile; returns the chart and its tile. */
    const createComposerDashboard = async (
        pipeline: ComposerChartPipeline,
        chart?: CreateComposerChart['chart'],
    ) => {
        const dashboard = await createDashboard();
        const body = composerChartBody(dashboard.uuid);
        const created = await admin.post<Body<ComposerChart>>(chartsUrl, {
            ...body,
            pipeline,
            chart: chart ?? {
                ...body.chart,
                columns: [
                    { reference: 'status', fieldType: FieldType.DIMENSION },
                    { reference: 'n', fieldType: FieldType.METRIC },
                ],
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: { xField: 'status', yField: ['n'] },
                        eChartsConfig: {},
                    },
                },
                tableConfig: { columnOrder: ['status', 'n'] },
            },
        });
        expect(created.status).toBe(201);
        const updated = await addComposerTile(
            dashboard,
            created.body.results.uuid,
        );
        expect(updated.status).toBe(200);
        return {
            dashboard,
            chart: created.body.results,
            tileUuid: updated.body.results.tiles[0].uuid,
        };
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
        const dashboard = await createDashboard();
        const chart = await createChart(dashboard.uuid);
        expect(chart).toMatchObject({
            projectUuid,
            dashboardUuid: dashboard.uuid,
            name: 'Orders by status',
            slug: expect.stringMatching(/^orders-by-status/),
            pipeline: composerChartBody(dashboard.uuid).pipeline,
            chart: composerChartBody(dashboard.uuid).chart,
        });

        const updated = await addComposerTile(dashboard, chart.uuid);
        expect(updated.status).toBe(200);
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

    it('refuses a custom chart type by name', async () => {
        const dashboard = await createDashboard();
        const body = composerChartBody(dashboard.uuid);
        const refused = await admin.post<{ error: { message: string } }>(
            chartsUrl,
            {
                ...body,
                chart: {
                    ...body.chart,
                    chartConfig: { type: ChartType.DATA_APP_VIZ },
                },
            },
            { failOnStatusCode: false },
        );
        expect(refused.status).toBe(400);
        expect(refused.body.error.message).toContain('custom chart types');
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
    it('lets a dashboard viewer run every node, sql, merge and duckdb included, and read its rows', async () => {
        const { dashboard, chart, tileUuid } =
            await createComposerDashboard(everyKindPipeline);
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
        ).toEqual(everyKindPipeline.nodes.map(({ nodeId }) => nodeId).sort());
        for (const { queryUuid } of run.body.results.queries) {
            // eslint-disable-next-line no-await-in-loop
            expect((await pollRows(viewer, queryUuid)).length).toBeGreaterThan(
                0,
            );
        }
    });

    it('returns a semantic-layer chart’s own fields, so the tile draws the project’s labels and formats', async () => {
        const body = composerChartBody('');
        const { chart, tileUuid } = await createComposerDashboard(
            body.pipeline,
            body.chart,
        );
        const viewer = await loginAsViewer();
        const run = await viewer.post<Body<ComposerChartRunResults>>(
            runUrl(chart.uuid),
            runRequest(chart.dashboardUuid, tileUuid),
        );
        expect(run.status).toBe(200);
        expect(run.body.results.chartStageQueryUuid).toBeNull();
        expect(run.body.results.fields).toMatchObject({
            orders_status: { table: 'orders', fieldType: FieldType.DIMENSION },
            orders_total_order_amount: {
                table: 'orders',
                fieldType: FieldType.METRIC,
            },
        });
    });

    it('runs a one-node semantic-layer chart to the same rows as the classic query', async () => {
        const body = composerChartBody('');
        const { chart, tileUuid } = await createComposerDashboard(
            body.pipeline,
            body.chart,
        );
        const run = await admin.post<Body<ComposerChartRunResults>>(
            runUrl(chart.uuid),
            runRequest(chart.dashboardUuid, tileUuid),
        );
        expect(run.status).toBe(200);
        const [node] = body.pipeline.nodes;
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
                await pollRows(admin, run.body.results.queries[0].queryUuid),
            ),
        ).toBe(
            sortedRaw(await pollRows(admin, classic.body.results.queryUuid)),
        );
    });

    it('runs a group-by as a server-built pivot stage whose rows a viewer can read', async () => {
        const { chart, tileUuid } = await createComposerDashboard(
            {
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
            {
                schemaVersion: 1,
                columns: [
                    { reference: 'status', fieldType: FieldType.DIMENSION },
                    { reference: 'size', fieldType: FieldType.DIMENSION },
                    { reference: 'total', fieldType: FieldType.METRIC },
                ],
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: { xField: 'status', yField: ['total'] },
                        eChartsConfig: {},
                    },
                },
                pivotConfig: { columns: ['size'] },
                tableConfig: { columnOrder: [] },
            },
        );
        const viewer = await loginAsViewer();
        const run = await viewer.post<Body<ComposerChartRunResults>>(
            runUrl(chart.uuid),
            runRequest(chart.dashboardUuid, tileUuid),
        );
        expect(run.status).toBe(200);
        const { chartStageQueryUuid, queries } = run.body.results;
        if (!chartStageQueryUuid) throw new Error('No series-split stage ran');
        expect(queries.map(({ queryUuid }) => queryUuid)).toContain(
            chartStageQueryUuid,
        );
        expect(
            (await pollRows(viewer, chartStageQueryUuid)).length,
        ).toBeGreaterThan(0);
    });

    it('refuses a run request carrying nodes, or naming a chart its dashboard does not own', async () => {
        const { dashboard, chart, tileUuid } =
            await createComposerDashboard(everyKindPipeline);
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

        const other = await createComposerDashboard(everyKindPipeline);
        const otherChart = await admin.post(
            runUrl(other.chart.uuid),
            runRequest(dashboard.uuid, tileUuid),
            { failOnStatusCode: false },
        );
        expect(otherChart.status).toBe(403);
    });

    it('refuses a run from another organization', async () => {
        const { dashboard, chart, tileUuid } =
            await createComposerDashboard(everyKindPipeline);
        const outsider = await anotherLogin();
        const refused = await outsider.post(
            runUrl(chart.uuid),
            runRequest(dashboard.uuid, tileUuid),
            { failOnStatusCode: false },
        );
        expect(refused.status).toBe(403);
    });

    it('refuses a run with the flag off while classic queries still run', async () => {
        const { dashboard, chart, tileUuid } =
            await createComposerDashboard(everyKindPipeline);
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
            expect((await admin.post(flagUrl, { enabled: true })).status).toBe(
                200,
            );
        }
    });
});
