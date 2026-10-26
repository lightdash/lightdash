import { ChartType } from '@lightdash/common';
import { buildAiTokenDashboard } from './aiTokenDashboard';
import { withAnalyticsChartPresentation } from './analyticsChartPresentation';
import {
    analyticsContentAsCode,
    analyticsSampleDashboards,
} from './sampleContent';
import { buildUsageDashboards } from './usageDashboards';

type TokenSpec = {
    transform: { joinaggregate?: unknown[]; calculate?: string; as?: string }[];
    layer: {
        transform: unknown[];
        encoding: {
            text?: { value?: string };
            tooltip?: unknown[];
        };
    }[];
};

const getTokenSpec = (key: string): TokenSpec => {
    const chart = buildAiTokenDashboard().charts.find(({ slug }) =>
        slug.endsWith(`-${key}`),
    )!;
    if (
        chart.chartConfig.type !== ChartType.CUSTOM ||
        !chart.chartConfig.config?.spec
    ) {
        throw new Error('Expected a custom token chart');
    }
    return chart.chartConfig.config.spec as TokenSpec;
};

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

    it('retains the native daily chart alongside the calendar', () => {
        const original = analyticsSampleDashboards
            .flatMap(({ charts }) => charts)
            .find(({ key }) => key === 'queries-by-day')!;
        const native = analyticsContentAsCode
            .flatMap(({ charts }) => charts)
            .find(
                ({ slug }) =>
                    slug ===
                    'lightdash-analytics-query-activity-queries-by-day',
            )!;
        expect(native.metricQuery).toBe(original.metricQuery);
        expect(native.tableConfig).toBe(original.tableConfig);
        expect(native.chartConfig.type).toBe(ChartType.CARTESIAN);
        expect(native.name).toBe(original.name);
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

    it.each(['feature-daily', 'feature-rank'])(
        'distinguishes unreported usage from truncated results in %s',
        (key) => {
            const spec = getTokenSpec(key);
            const missingUsage = spec.layer.find(
                (layer) =>
                    layer.encoding?.text?.value === 'No reported token totals',
            );
            const truncated = spec.layer.find((layer) =>
                layer.encoding?.text?.value?.startsWith('Too many groups'),
            );

            // Missing usage must not claim completeness at the query cap.
            expect(missingUsage?.transform[0]).toEqual({
                filter: 'datum.reported_rows === 0 && datum.source_rows < 5000',
            });
            expect(truncated?.transform[0]).toEqual({
                filter: 'datum.source_rows >= 5000',
            });
            // Count valid values, including zero, rather than treating a
            // zero total as absent provider usage.
            expect(spec.transform[0].joinaggregate).toContainEqual({
                op: 'valid',
                field: 'ai_usage_total_tokens_used',
                as: 'reported_rows',
            });
        },
    );

    it('formats token daily tooltips in UTC rather than the viewer timezone', () => {
        const spec = getTokenSpec('feature-daily');
        expect(spec.transform).toContainEqual({
            calculate:
                "utcFormat(toDate(datum.ai_usage_event_ts_day), '%d %b %Y')",
            as: 'utc_day_label',
        });
        expect(spec.layer[0].encoding.tooltip).toContainEqual({
            field: 'utc_day_label',
            type: 'nominal',
            title: 'UTC day',
        });
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
