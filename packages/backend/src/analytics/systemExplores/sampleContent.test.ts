import { CartesianSeriesType, ChartType } from '@lightdash/common';
import { createAnalyticsExplores } from '../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import {
    analyticsContentAsCode,
    analyticsSampleDashboards,
} from './sampleContent';

describe('analytics sample content', () => {
    it('exports portable content-as-code with dashboard-owned chart references', () => {
        for (const { dashboard, charts } of analyticsContentAsCode) {
            expect(dashboard.version).toBe(1);
            expect(dashboard.tiles.map((tile) => tile.properties)).toEqual(
                charts.map(({ slug }) => ({ chartSlug: slug })),
            );
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
        expect(analyticsContentAsCode[1].dashboard.tiles.at(-1)?.w).toBe(36);
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

    it('keeps the overview identity and provisions a query-only dashboard', () => {
        expect(analyticsSampleDashboards[0].key).toBe(
            'lightdash-analytics-overview',
        );
        const queryDashboard = analyticsSampleDashboards[1];
        expect(queryDashboard.key).toBe('lightdash-analytics-query-activity');
        expect(queryDashboard.charts).toHaveLength(9);
        expect(
            queryDashboard.charts.every(
                ({ tableName }) => tableName === 'query_events',
            ),
        ).toBe(true);
    });
});
