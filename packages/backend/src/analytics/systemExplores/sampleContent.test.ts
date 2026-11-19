import {
    CartesianSeriesType,
    ChartType,
    DashboardTileTypes,
} from '@lightdash/common';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import {
    analyticsContentAsCode,
    analyticsDefaultSpace,
    analyticsLibraryChartBindings,
    analyticsSampleDashboards,
} from './sampleContent';

describe('analytics sample content', () => {
    it('exports portable content-as-code with dashboard-owned chart references', () => {
        for (const { dashboard, charts } of analyticsContentAsCode) {
            expect(dashboard.version).toBe(1);
            expect(dashboard.spaceSlug).toBe(analyticsDefaultSpace.slug);
            expect(dashboard.verified).toBe(true);
            expect(
                new Set(
                    dashboard.tiles
                        .filter(
                            (tile) =>
                                tile.type === DashboardTileTypes.SAVED_CHART,
                        )
                        .map((tile) => tile.properties.chartSlug),
                ),
            ).toEqual(new Set(charts.map(({ slug }) => slug)));
            expect(
                charts.every((chart) => chart.dashboardSlug === dashboard.slug),
            ).toBe(true);
            expect(
                charts.every(
                    (chart) => chart.spaceSlug === dashboard.spaceSlug,
                ),
            ).toBe(true);
            expect(
                dashboard.tiles.every((tile) => tile.uuid === undefined),
            ).toBe(true);
            for (const tile of dashboard.tiles) {
                expect(tile.x + tile.w).toBeLessThanOrEqual(36);
            }
        }
        expect(
            analyticsContentAsCode[1].dashboard.tiles
                .filter((tile) => tile.tabSlug === 'overview')
                .at(-1)?.w,
        ).toBe(36);
    });
    it('uses unique stable keys and fields available in the system explores', () => {
        const explores = createAnalyticsExplores();
        const dashboardKeys = analyticsSampleDashboards.map(({ key }) => key);
        expect(new Set(dashboardKeys).size).toBe(dashboardKeys.length);
        for (const dashboard of analyticsSampleDashboards) {
            const keys = dashboard.charts.map(({ key }) => key);
            expect(new Set(keys).size).toBe(keys.length);
            for (const chart of dashboard.charts) {
                expect(chart.metricQuery.limit).toBeLessThanOrEqual(5000);
                const explore = explores.find(
                    ({ name }) => name === chart.tableName,
                )!;
                expect(explore).toBeDefined();
                const table = explore.tables[chart.tableName];
                const fields = new Set(
                    [
                        ...Object.keys(table.dimensions),
                        ...Object.keys(table.metrics),
                    ].map((name) => `${chart.tableName}_${name}`),
                );
                for (const field of [
                    ...chart.metricQuery.dimensions,
                    ...chart.metricQuery.metrics,
                ]) {
                    expect(fields).toContain(field);
                }
            }
        }
    });

    it('renders daily trends as chronologically sorted lines', () => {
        for (const chart of analyticsSampleDashboards
            .flatMap(({ charts }) => charts)
            .filter(({ key }) =>
                [
                    'ai-calls-by-day',
                    'tokens-by-day',
                    'queries-by-day',
                    'active-users-by-day',
                ].includes(key),
            )) {
            expect(chart.chartConfig).toMatchObject({
                type: ChartType.CARTESIAN,
                config: {
                    eChartsConfig: {
                        series: [
                            { type: CartesianSeriesType.LINE, smooth: false },
                        ],
                    },
                },
            });
            expect(chart.metricQuery.sorts).toEqual([
                {
                    fieldId: `${chart.tableName}_event_ts_day`,
                    descending: false,
                },
            ]);
        }
    });

    it('keeps existing identities while separating AI and query content', () => {
        expect(analyticsSampleDashboards[0].key).toBe(
            'lightdash-analytics-overview',
        );
        const aiDashboard = analyticsSampleDashboards[0];
        expect(aiDashboard.name).toBe('AI usage');
        expect(aiDashboard.spaceSlug).toBe('lightdash-usage-overview');
        expect(aiDashboard.charts).toHaveLength(9);
        expect(
            aiDashboard.charts.every(
                ({ tableName }) => tableName === 'ai_usage',
            ),
        ).toBe(true);
        const queryDashboard = analyticsSampleDashboards[1];
        expect(queryDashboard.key).toBe('lightdash-analytics-query-activity');
        expect(queryDashboard.spaceSlug).toBe('query-activity');
        expect(queryDashboard.charts).toHaveLength(9);
        expect(
            queryDashboard.charts.every(
                ({ tableName }) => tableName === 'query_events',
            ),
        ).toBe(true);
    });

    describe('Agents & AI overview tab', () => {
        const overviewTiles = (dashboardSlug: string) =>
            analyticsContentAsCode
                .find(({ dashboard }) => dashboard.slug === dashboardSlug)!
                .dashboard.tiles.filter((tile) => tile.tabSlug === 'overview')
                .map(({ properties, x, y, w, h }) => ({
                    chartSlug:
                        'chartSlug' in properties ? properties.chartSlug : null,
                    x,
                    y,
                    w,
                    h,
                }));

        it('lays out the overview tiles at their explicit positions', () => {
            const prefix = 'lightdash-analytics-overview-';
            expect(overviewTiles('lightdash-analytics-overview')).toEqual(
                expect.arrayContaining(
                    [
                        ['ai-calls', 0, 0, 9, 3],
                        ['tokens', 9, 0, 9, 3],
                        ['ai-users', 18, 0, 9, 3],
                        ['output-tokens', 27, 0, 9, 3],
                        ['tokens-by-feature', 0, 3, 36, 7],
                        ['ai-calls-by-day', 0, 10, 18, 7],
                        ['tokens-by-day', 18, 10, 18, 7],
                        ['tokens-by-model', 0, 17, 18, 8],
                        ['calls-by-model', 18, 17, 18, 8],
                    ].map(([key, x, y, w, h]) => ({
                        chartSlug: `${prefix}${key}`,
                        x,
                        y,
                        w,
                        h,
                    })),
                ),
            );
            expect(overviewTiles('lightdash-analytics-overview')).toHaveLength(
                9,
            );
        });

        it('falls back to a bar chart for tokens by feature and binds the heatmap', () => {
            const slug = 'lightdash-analytics-overview-tokens-by-feature';
            const tokensByFeature = analyticsContentAsCode
                .flatMap(({ charts }) => charts)
                .find((item) => item.slug === slug)!;
            expect(tokensByFeature.chartConfig.type).toBe(ChartType.CARTESIAN);
            expect(tokensByFeature.metricQuery.dimensions).toEqual([
                'ai_usage_feature',
            ]);
            expect(analyticsLibraryChartBindings.get(slug)).toMatchObject({
                slug: 'heatmap',
                minVersion: '0.4.2',
            });
        });

        it('keeps the query activity overview geometry', () => {
            const prefix = 'lightdash-analytics-query-activity-';
            expect(overviewTiles('lightdash-analytics-query-activity')).toEqual(
                [
                    ['queries', 0, 0, 9, 3],
                    ['query-users', 9, 0, 9, 3],
                    ['avg-execution-time', 18, 0, 9, 3],
                    ['p90-execution-time', 27, 0, 9, 3],
                    ['queries-by-day', 0, 9, 18, 8],
                    ['active-users-by-day', 18, 9, 18, 8],
                    ['query-cache', 0, 17, 18, 8],
                    ['queries-by-context', 18, 17, 18, 8],
                    ['query-latency-by-day', 0, 25, 36, 8],
                    ['query-calendar', 0, 3, 36, 6],
                ].map(([key, x, y, w, h]) => ({
                    chartSlug: `${prefix}${key}`,
                    x,
                    y,
                    w,
                    h,
                })),
            );
        });
    });
});
