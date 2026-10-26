import { ChartType } from '@lightdash/common';
import { buildAiTokenDashboard } from './aiTokenDashboard';
import { withAnalyticsChartPresentation } from './analyticsChartPresentation';
import { analyticsContentAsCode } from './sampleContent';
import { buildUsageDashboards } from './usageDashboards';

describe('analytics chart presentation', () => {
    const originalCharts = [
        ...buildUsageDashboards([]),
        buildAiTokenDashboard(),
    ].flatMap(({ charts }) => charts);

    it.each(originalCharts.map((chart) => [chart.slug, chart] as const))(
        'preserves the complete query and identity of %s',
        (_slug, original) => {
            const before = structuredClone(original);
            const result = withAnalyticsChartPresentation(original);
            expect(original).toEqual(before);
            expect(result.metricQuery).toBe(original.metricQuery);
            expect(result.tableConfig).toBe(original.tableConfig);
            expect(result.slug).toBe(original.slug);
            expect(result.dashboardSlug).toBe(original.dashboardSlug);
            expect(result.spaceSlug).toBe(original.spaceSlug);
        },
    );

    it('preserves explicit identity columns in token attribution details', () => {
        const chart = withAnalyticsChartPresentation(
            originalCharts.find(
                ({ slug }) => slug === 'lightdash-analytics-ai-tokens-details',
            )!,
        );
        expect(chart.chartConfig.type).toBe(ChartType.TABLE);
        if (chart.chartConfig.type === ChartType.TABLE) {
            for (const id of [
                'ai_usage_user_id',
                'ai_usage_project_id',
                'ai_usage_agent_id',
            ]) {
                expect(
                    chart.chartConfig.config?.columns?.[id]?.visible,
                ).not.toBe(false);
            }
        }
    });

    it('keeps isolated observations visible on line charts', () => {
        for (const { charts } of analyticsContentAsCode) {
            for (const chart of charts) {
                if (chart.chartConfig.type === ChartType.CARTESIAN) {
                    for (const series of chart.chartConfig.config?.eChartsConfig
                        ?.series ?? []) {
                        if (series.type === 'line')
                            expect(series.showSymbol).toBe(true);
                    }
                }
            }
        }
    });

    it('keeps every tile inside the grid without overlapping another tile in its tab', () => {
        for (const { dashboard } of analyticsContentAsCode) {
            for (const [index, tile] of dashboard.tiles.entries()) {
                expect(tile.x).toBeGreaterThanOrEqual(0);
                expect(tile.x + tile.w).toBeLessThanOrEqual(36);
                expect(tile.h).toBeGreaterThan(0);
                for (const other of dashboard.tiles
                    .slice(index + 1)
                    .filter(
                        (candidate) => candidate.tabSlug === tile.tabSlug,
                    )) {
                    const overlaps =
                        tile.x < other.x + other.w &&
                        tile.x + tile.w > other.x &&
                        tile.y < other.y + other.h &&
                        tile.y + tile.h > other.y;
                    expect(
                        overlaps,
                        `${dashboard.slug}: ${tile.tileSlug} overlaps ${other.tileSlug}`,
                    ).toBe(false);
                }
            }
        }
    });
});
