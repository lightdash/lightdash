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
            ['lightdash-analytics-ai-tokens-ai-users', 'ai_usage_event_ts_day'],
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
        // The token tiles that follow the Date filter belong to AI token usage
        expect(analyticsSampleDashboards[0].key).toBe(
            'lightdash-analytics-ai-tokens',
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

    describe('AI token usage, Any period tab', () => {
        const overviewTiles = (dashboardSlug: string) =>
            analyticsContentAsCode
                .find(({ dashboard }) => dashboard.slug === dashboardSlug)!
                .dashboard.tiles.filter(
                    (tile) =>
                        tile.tabSlug ===
                        (dashboardSlug === 'lightdash-analytics-ai-tokens'
                            ? 'any-period'
                            : 'overview'),
                )
                .map(({ properties, x, y, w, h }) => ({
                    chartSlug:
                        'chartSlug' in properties ? properties.chartSlug : null,
                    x,
                    y,
                    w,
                    h,
                }));

        it('opens the tab with one caption row that tells the three token totals apart', () => {
            const { dashboard, charts } = analyticsContentAsCode.find(
                ({ dashboard: { slug } }) =>
                    slug === 'lightdash-analytics-ai-tokens',
            )!;
            const [first, ...others] = dashboard.tiles.filter(
                (tile) =>
                    tile.tabSlug === 'any-period' &&
                    tile.type === DashboardTileTypes.MARKDOWN,
            );
            // One more caption sits above the two tiles added under the nine
            expect(others).toHaveLength(1);
            expect(first).toMatchObject({
                x: 0,
                y: 0,
                w: 36,
                h: 1,
                properties: { hideFrame: true },
            });
            const { content } = first.properties as { content: string };
            expect(content).toContain('follows the Date filter');
            expect(content).toContain('Tokens (all usage)');
            expect(content).toContain('Tokens in billing scope');
            // The tab is first, and the month-to-date tabs follow it
            expect(dashboard.tabs.map(({ name }) => name)).toEqual([
                'Any period',
                'Feature',
                'Channel',
                'Person',
                'Project',
                'Agent',
                'All usage',
                'Completeness & attribution',
            ]);
            // The Date and Project filters reach the any-period tiles only
            const [date] = dashboard.filters!.dimensions!;
            expect(date.label).toBe('Date');
            charts.forEach(({ slug }) =>
                expect(date.tileTargets?.[slug] !== false).toBe(
                    dashboard.tiles.some(
                        (tile) =>
                            tile.tabSlug === 'any-period' &&
                            'chartSlug' in tile.properties &&
                            tile.properties.chartSlug === slug,
                    ),
                ),
            );
            // The caption carries the caveat, so the token tiles do not repeat it.
            const overviewSlugs = dashboard.tiles
                .filter((tile) => tile.tabSlug === 'any-period')
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
            const prefix = 'lightdash-analytics-ai-tokens-';
            expect(overviewTiles('lightdash-analytics-ai-tokens')).toEqual(
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
            // Nine charts and the caption row above them, then a caption and two charts by person
            // and by feature that came from the old Retries & tokens tab
            expect(overviewTiles('lightdash-analytics-ai-tokens')).toHaveLength(
                13,
            );
        });

        it('falls back to a bar chart for tokens by feature and binds the heatmap', () => {
            const slug = 'lightdash-analytics-ai-tokens-tokens-by-feature';
            const tokensByFeature = analyticsContentAsCode
                .flatMap(({ charts }) => charts)
                .find((item) => item.slug === slug)!;
            expect(tokensByFeature.chartConfig.type).toBe(ChartType.CARTESIAN);
            // The feature under its plain name, as on AI token usage
            expect(tokensByFeature.metricQuery.dimensions).toEqual([
                'ai_usage_feature_name',
            ]);
            expect(analyticsLibraryChartBindings.get(slug)).toMatchObject({
                slug: 'heatmap',
                // The colour range stops at the 95th percentile, so one huge day does not wash out the rest
                minVersion: '0.5.1',
                optionValues: { colorClampPercentile: 95 },
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
