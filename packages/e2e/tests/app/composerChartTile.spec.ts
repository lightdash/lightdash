import {
    ApiChartSummaryListResponse,
    ComposerChart,
    CreateComposerChart,
    CreateDashboard,
    DashboardTileTypes,
    FeatureFlags,
    FieldType,
    QuerySourceType,
    SavedChart,
    SEED_PROJECT,
} from '@lightdash/common';
import {
    expect,
    json,
    loginAs,
    SEED_USERS,
    test,
    TrackedApi,
} from '../../support/test';

const projectUuid = SEED_PROJECT.project_uuid;
const CLASSIC_CHART_NAME = 'How much revenue do we have per payment method?';

const getSeedChart = async (api: TrackedApi): Promise<SavedChart> => {
    const charts = await json<ApiChartSummaryListResponse['results']>(
        await api.get(`/api/v1/projects/${projectUuid}/charts`),
    );
    const summary = charts.find(({ name }) => name === CLASSIC_CHART_NAME);
    expect(summary, CLASSIC_CHART_NAME).toBeDefined();
    return json<SavedChart>(await api.get(`/api/v1/saved/${summary!.uuid}`));
};

/** The classic chart's query as one semantic-layer node, drawn by the same chart config. */
const toComposerChart = (
    chart: SavedChart,
    dashboardUuid: string,
): CreateComposerChart => {
    const { metricQuery } = chart;
    return {
        dashboardUuid,
        name: 'Composer parity',
        pipeline: {
            schemaVersion: 1,
            terminalNodeId: 'result',
            nodes: [
                {
                    sourceType: QuerySourceType.SEMANTIC_LAYER,
                    nodeId: 'result',
                    title: 'Result',
                    exploreName: chart.tableName,
                    dimensions: metricQuery.dimensions,
                    metrics: metricQuery.metrics,
                    filters: metricQuery.filters,
                    sorts: metricQuery.sorts,
                    limit: metricQuery.limit,
                },
            ],
        },
        chart: {
            schemaVersion: 1,
            columns: [
                ...metricQuery.dimensions.map((reference) => ({
                    reference,
                    fieldType: FieldType.DIMENSION as const,
                })),
                ...metricQuery.metrics.map((reference) => ({
                    reference,
                    fieldType: FieldType.METRIC as const,
                })),
            ],
            chartConfig: chart.chartConfig,
            pivotConfig: null,
            tableConfig: { columnOrder: chart.tableConfig.columnOrder },
        },
    };
};

test.describe('Composer chart tile', () => {
    let dashboardUuid: string | null = null;

    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
        const flagUrl = `/api/v2/feature-flag/${FeatureFlags.ComposerCharts}`;
        const flag = await json<{ enabled: boolean }>(await api.get(flagUrl));
        expect(flag.enabled, 'composer-charts is on in previews').toBe(true);
    });

    test.afterEach(async ({ api }) => {
        if (dashboardUuid) {
            await api.delete(`/api/v1/dashboards/${dashboardUuid}`);
            dashboardUuid = null;
        }
    });

    test('a one-node semantic-layer chart draws the same chart as the classic chart with the same query', async ({
        page,
        api,
    }) => {
        const classic = await getSeedChart(api);
        const dashboardBody: CreateDashboard = {
            name: `e2e composer parity ${Date.now()}`,
            tiles: [],
            tabs: [],
        };
        const dashboard = await json<{ uuid: string }>(
            await api.post(`/api/v1/projects/${projectUuid}/dashboards`, {
                data: dashboardBody,
            }),
        );
        dashboardUuid = dashboard.uuid;
        const composer = await json<ComposerChart>(
            await api.post(`/api/v2/projects/${projectUuid}/composer-charts`, {
                data: toComposerChart(classic, dashboard.uuid),
            }),
        );
        const tile = { y: 0, w: 18, h: 9, tabUuid: null };
        const updated = await api.patch(
            `/api/v1/dashboards/${dashboard.uuid}`,
            {
                data: {
                    tiles: [
                        {
                            ...tile,
                            x: 0,
                            type: DashboardTileTypes.SAVED_CHART,
                            properties: {
                                title: 'Classic',
                                savedChartUuid: classic.uuid,
                            },
                        },
                        {
                            ...tile,
                            x: 18,
                            type: DashboardTileTypes.COMPOSER_CHART,
                            properties: {
                                title: 'Composer',
                                composerChartUuid: composer.uuid,
                                chartName: null,
                            },
                        },
                    ],
                    filters: {
                        dimensions: [],
                        metrics: [],
                        tableCalculations: [],
                    },
                    tabs: [],
                },
            },
        );
        expect(updated.status()).toBe(200);

        await page.goto(
            `/projects/${projectUuid}/dashboards/${dashboard.uuid}/view`,
        );
        const chartOf = (title: string) =>
            page
                .locator('.react-grid-item')
                .filter({ hasText: title })
                .locator('.echarts-for-react');
        await expect(
            page.getByTestId('composer-chart-visualization'),
        ).toBeVisible();
        await expect(chartOf('Classic')).toBeVisible();
        await expect(chartOf('Composer')).toBeVisible();
        // Same rows, fields and chart config draw the same pixels.
        await expect(async () => {
            expect(await chartOf('Composer').screenshot()).toEqual(
                await chartOf('Classic').screenshot(),
            );
        }).toPass({ timeout: 30_000 });
    });
});
