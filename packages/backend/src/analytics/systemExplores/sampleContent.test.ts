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

    it('shows the latest day on both versions of the latest-day cards', () => {
        const allCharts = analyticsContentAsCode.flatMap(
            ({ charts }) => charts,
        );
        const cards = [
            ['lightdash-analytics-overview-ai-users', 'ai_usage_event_ts_day'],
            [
                'lightdash-analytics-overview-agent-requesters-trend',
                'agent_requests_requested_at_day',
            ],
            [
                'lightdash-analytics-query-activity-query-users',
                'query_events_event_ts_day',
            ],
            [
                'lightdash-analytics-query-activity-avg-execution-time',
                'query_events_event_ts_day',
            ],
            [
                'lightdash-analytics-query-activity-p90-execution-time',
                'query_events_event_ts_day',
            ],
        ];
        for (const [slug, day] of cards) {
            const fallback = allCharts.find((chart) => chart.slug === slug)!;
            // A big number shows the first row: one row, newest day first.
            expect(fallback.chartConfig.type).toBe(ChartType.BIG_NUMBER);
            expect(fallback.metricQuery.dimensions).toEqual([day]);
            expect(fallback.metricQuery.sorts).toEqual([
                { fieldId: day, descending: true },
            ]);
            expect(fallback.metricQuery.limit).toBe(1);
            expect(fallback.description).toContain(
                'on the latest day in the selected period',
            );
            expect(fallback.description).not.toContain('daily trend');

            const binding = analyticsLibraryChartBindings.get(slug)!;
            expect(binding.optionValues).toMatchObject({
                valueAggregation: 'latest',
                label: 'Latest day',
            });
            expect(binding.query?.dimensions).toEqual([day]);
            expect(binding.query?.description).toContain(
                'on the latest day in the selected period, with the daily trend',
            );
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

        it('opens the overview with one caption row saying tokens are not cost', () => {
            const { dashboard, charts } = analyticsContentAsCode.find(
                ({ dashboard: { slug } }) =>
                    slug === 'lightdash-analytics-overview',
            )!;
            const notes = dashboard.tiles.filter(
                (tile) =>
                    tile.tabSlug === 'overview' &&
                    tile.type === DashboardTileTypes.MARKDOWN,
            );
            expect(notes).toHaveLength(1);
            expect(notes[0]).toMatchObject({
                x: 0,
                y: 0,
                w: 36,
                h: 1,
                properties: {
                    content: 'Tokens measure usage, not cost.',
                    hideFrame: true,
                },
            });
            // The caption carries the caveat, so the token tiles do not repeat it.
            const overviewSlugs = dashboard.tiles
                .filter((tile) => tile.tabSlug === 'overview')
                .flatMap(({ properties }) =>
                    'chartSlug' in properties ? [properties.chartSlug] : [],
                );
            for (const chart of charts.filter(({ slug }) =>
                overviewSlugs.includes(slug),
            )) {
                expect(chart.description).not.toMatch(/cost/i);
            }
        });

        it('lays out the overview tiles at their explicit positions', () => {
            const prefix = 'lightdash-analytics-overview-';
            expect(overviewTiles('lightdash-analytics-overview')).toEqual(
                expect.arrayContaining(
                    [
                        ['ai-calls', 0, 1, 9, 4],
                        ['tokens', 9, 1, 9, 4],
                        ['ai-users', 18, 1, 9, 4],
                        ['output-tokens', 27, 1, 9, 4],
                        ['tokens-by-feature', 0, 5, 36, 7],
                        ['ai-calls-by-day', 0, 12, 18, 7],
                        ['tokens-by-day', 18, 12, 18, 7],
                        ['tokens-by-model', 0, 19, 18, 8],
                        ['calls-by-model', 18, 19, 18, 8],
                    ].map(([key, x, y, w, h]) => ({
                        chartSlug: `${prefix}${key}`,
                        x,
                        y,
                        w,
                        h,
                    })),
                ),
            );
            // Nine charts and the caption row above them.
            expect(overviewTiles('lightdash-analytics-overview')).toHaveLength(
                10,
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
                minVersion: '0.5.0',
            });
        });

        it('keeps the query activity overview geometry', () => {
            const prefix = 'lightdash-analytics-query-activity-';
            expect(overviewTiles('lightdash-analytics-query-activity')).toEqual(
                [
                    ['queries', 0, 0, 9, 4],
                    ['query-users', 9, 0, 9, 4],
                    ['avg-execution-time', 18, 0, 9, 4],
                    ['p90-execution-time', 27, 0, 9, 4],
                    ['queries-by-day', 0, 10, 18, 8],
                    ['active-users-by-day', 18, 10, 18, 8],
                    ['query-cache', 0, 18, 18, 8],
                    ['queries-by-context', 18, 18, 18, 8],
                    ['query-latency-by-day', 0, 26, 36, 8],
                    ['query-calendar', 0, 4, 36, 6],
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
