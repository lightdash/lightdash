import {
    DashboardTileTypes,
    generateSlug,
    isComposerChartAsCode,
    PromotionAction,
    SEED_COMPOSER_CHART,
    SEED_COMPOSER_CHART_DASHBOARD,
    SEED_PROJECT,
    type ApiChartAsCodeListResponse,
    type ApiChartAsCodeUpsertResponse,
    type ApiDashboardAsCodeListResponse,
    type ApiDashboardAsCodeUpsertResponse,
    type ComposerChartAsCode,
    type DashboardAsCode,
    type DashboardChartTileAsCode,
    type DashboardTileAsCode,
    type FeatureFlag,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

// A composer chart round-trips through content as code: download emits its
// stored pipeline, upload writes it back through the composer save path.
const projectUuid = SEED_PROJECT.project_uuid;
const COMPOSE_FLAG = 'compose-sql-runner';
const seedChartSlug = generateSlug(SEED_COMPOSER_CHART.revenueShare);
const seedChartSlugs = Object.values(SEED_COMPOSER_CHART).map(generateSlug);
const uploadedSlug = 'api-test-composer-chart-as-code';

type ApiErrorBody = { error: { name: string; message: string } };
type ChartListBody = Body<ApiChartAsCodeListResponse['results']>;
type ChartUpsertBody = Body<ApiChartAsCodeUpsertResponse['results']>;

const isChartTileAsCode = (
    tile: DashboardTileAsCode,
): tile is DashboardChartTileAsCode =>
    tile.type === DashboardTileTypes.SAVED_CHART;

describe('Composer charts as code', () => {
    let admin: ApiClient;
    let flagWasEnabled: boolean;
    let seedChart: ComposerChartAsCode;

    const setFlag = async (enabled: boolean) => {
        const response = await admin.post(
            `/api/v2/feature-flag/${COMPOSE_FLAG}`,
            { enabled },
        );
        expect(response.status).toBe(200);
    };

    const downloadChart = async (slug: string) => {
        const response = await admin.get<ChartListBody>(
            `/api/v1/projects/${projectUuid}/code/charts?ids=${slug}`,
        );
        expect(response.status).toBe(200);
        return response.body.results;
    };

    const uploadChart = (slug: string, body: unknown) =>
        admin.post<ChartUpsertBody & ApiErrorBody>(
            `/api/v1/projects/${projectUuid}/code/charts/${slug}`,
            body,
            { failOnStatusCode: false },
        );

    beforeAll(async () => {
        admin = await login();
        const flag = await admin.get<Body<FeatureFlag>>(
            `/api/v2/feature-flag/${COMPOSE_FLAG}`,
        );
        expect(flag.status).toBe(200);
        flagWasEnabled = flag.body.results.enabled;
        if (!flagWasEnabled) await setFlag(true);

        const { charts } = await downloadChart(seedChartSlug);
        expect(charts).toHaveLength(1);
        const [chart] = charts;
        if (!isComposerChartAsCode(chart)) {
            throw new Error(
                'seed composer chart downloaded as a classic chart',
            );
        }
        seedChart = chart;
    });

    afterAll(async () => {
        if (!flagWasEnabled) await setFlag(false);
    });

    it('downloads a composer chart as its stored pipeline, not a metric query', () => {
        expect(seedChart.pipeline.schemaVersion).toBe(1);
        expect(seedChart.pipeline.nodes.length).toBeGreaterThan(1);
        expect(seedChart.pipeline.nodes.map((node) => node.nodeId)).toContain(
            seedChart.pipeline.terminalNodeId,
        );
        expect(seedChart).not.toHaveProperty('metricQuery');
        expect(seedChart).not.toHaveProperty('tableName');
        expect(seedChart).toMatchObject({
            slug: seedChartSlug,
            name: SEED_COMPOSER_CHART.revenueShare,
            contentType: 'chart',
            version: 1,
            dashboardSlug: SEED_COMPOSER_CHART_DASHBOARD.slug,
            spaceSlug: 'jaffle-shop',
        });
        expect(seedChart.chartConfig.type).toBeDefined();
    });

    it('uploads a downloaded composer chart back as no changes', async () => {
        const response = await uploadChart(seedChartSlug, seedChart);
        expect(response.status).toBe(200);
        expect(response.body.results.charts).toEqual([]);
        expect(response.body.results.composerCharts).toHaveLength(1);
        expect(response.body.results.composerCharts?.[0].action).toBe(
            PromotionAction.NO_CHANGES,
        );
    });

    it('creates, updates and leaves unchanged a composer chart from a file', async () => {
        const description = `Uploaded at ${new Date().toISOString()}`;
        const file: ComposerChartAsCode = {
            ...seedChart,
            slug: uploadedSlug,
            name: 'API test composer chart as code',
            description,
        };

        const first = await uploadChart(uploadedSlug, file);
        expect(first.status).toBe(200);
        const [written] = first.body.results.composerCharts ?? [];
        expect([PromotionAction.CREATE, PromotionAction.UPDATE]).toContain(
            written.action,
        );
        expect(written.data).toMatchObject({
            slug: uploadedSlug,
            description,
            spaceSlug: seedChart.spaceSlug,
        });
        expect(written.data.pipeline).toEqual(seedChart.pipeline);

        const { charts } = await downloadChart(uploadedSlug);
        expect(charts).toHaveLength(1);
        expect(charts[0]).toMatchObject({
            slug: uploadedSlug,
            description,
            dashboardSlug: SEED_COMPOSER_CHART_DASHBOARD.slug,
            pipeline: seedChart.pipeline,
        });

        const again = await uploadChart(uploadedSlug, file);
        expect(again.status).toBe(200);
        expect(again.body.results.composerCharts?.[0].action).toBe(
            PromotionAction.NO_CHANGES,
        );

        const forced = await uploadChart(uploadedSlug, {
            ...file,
            force: true,
        });
        expect(forced.status).toBe(200);
        expect(forced.body.results.composerCharts?.[0].action).toBe(
            PromotionAction.UPDATE,
        );
    });

    it('refuses a pipeline node kind a composer chart cannot store', async () => {
        const [first, ...rest] = seedChart.pipeline.nodes;
        const response = await uploadChart(uploadedSlug, {
            ...seedChart,
            slug: uploadedSlug,
            pipeline: {
                ...seedChart.pipeline,
                nodes: [{ ...first, sourceType: 'sql' }, ...rest],
            },
        });
        // The route's body type refuses the node kind before the service does
        expect([400, 422]).toContain(response.status);
    });

    it('refuses a classic chart file at a composer chart slug and vice versa', async () => {
        const { pipeline, ...rest } = seedChart;
        const classicFile = {
            ...rest,
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: [],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
            },
        };
        const classicAtComposer = await uploadChart(seedChartSlug, classicFile);
        expect(classicAtComposer.status).toBe(400);
        expect(classicAtComposer.body.error.message).toContain(
            'is a composer chart',
        );

        const classicSlug =
            'how-do-payment-methods-vary-across-different-amount-ranges';
        const composerAtClassic = await uploadChart(classicSlug, {
            ...seedChart,
            slug: classicSlug,
        });
        expect(composerAtClassic.status).toBe(400);
        expect(composerAtClassic.body.error.message).toContain(
            'is a classic chart',
        );
    });

    it('refuses a file carrying both a pipeline and a metric query by name', async () => {
        const response = await uploadChart(uploadedSlug, {
            ...seedChart,
            slug: uploadedSlug,
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: [],
                filters: {},
                sorts: [],
                limit: 500,
                tableCalculations: [],
            },
        });
        expect(response.status).toBe(400);
        expect(response.body.error.message).toContain(
            `Chart "${uploadedSlug}" has both a pipeline and a metric query`,
        );
    });

    it('refuses an unknown chart type by name instead of failing the write', async () => {
        const response = await uploadChart(uploadedSlug, {
            ...seedChart,
            slug: uploadedSlug,
            chartConfig: { ...seedChart.chartConfig, type: 'dataAppViz' },
        });
        expect(response.status).toBe(400);
        expect(response.body.error.message).toContain(
            `Chart "${uploadedSlug}" has an unknown chart type "dataAppViz"`,
        );
    });

    it('marks composer tiles in a dashboard as code and keeps them on upload', async () => {
        const download = await admin.get<
            Body<ApiDashboardAsCodeListResponse['results']>
        >(
            `/api/v1/projects/${projectUuid}/code/dashboards?ids=${SEED_COMPOSER_CHART_DASHBOARD.slug}`,
        );
        expect(download.status).toBe(200);
        expect(download.body.results.dashboards).toHaveLength(1);
        const [dashboard] = download.body.results.dashboards;

        const chartTiles = dashboard.tiles.filter(isChartTileAsCode);
        const composerTiles = chartTiles.filter(
            (tile) => tile.properties.queryType === 'composer',
        );
        expect(composerTiles.length).toBeGreaterThan(0);
        composerTiles.forEach((tile) =>
            expect(seedChartSlugs).toContain(tile.properties.chartSlug),
        );
        chartTiles
            .filter(
                (tile) =>
                    tile.properties.chartSlug === null ||
                    !seedChartSlugs.includes(tile.properties.chartSlug),
            )
            .forEach((tile) =>
                expect(tile.properties).not.toHaveProperty('queryType'),
            );

        const upload = await admin.post<
            Body<ApiDashboardAsCodeUpsertResponse['results']>
        >(
            `/api/v1/projects/${projectUuid}/code/dashboards/${dashboard.slug}`,
            dashboard satisfies DashboardAsCode,
        );
        expect(upload.status).toBe(200);
        const [written] = upload.body.results.dashboards;
        expect(written.data.tiles).toHaveLength(dashboard.tiles.length);
        expect(upload.body.results.skippedCharts ?? []).toEqual([]);

        const after = await admin.get<
            Body<ApiDashboardAsCodeListResponse['results']>
        >(
            `/api/v1/projects/${projectUuid}/code/dashboards?ids=${SEED_COMPOSER_CHART_DASHBOARD.slug}`,
        );
        const composerTilesAfter = after.body.results.dashboards[0].tiles
            .filter(isChartTileAsCode)
            .filter((tile) => tile.properties.queryType === 'composer');
        expect(
            composerTilesAfter.map((tile) => tile.properties.chartSlug),
        ).toEqual(composerTiles.map((tile) => tile.properties.chartSlug));
    });

    it('refuses a composer chart upload while the compose flag is off', async () => {
        await setFlag(false);
        try {
            const response = await uploadChart(uploadedSlug, {
                ...seedChart,
                slug: uploadedSlug,
            });
            expect(response.status).toBe(403);
            expect(response.body.error.message).toContain('not enabled');
        } finally {
            await setFlag(true);
        }
    });
});
