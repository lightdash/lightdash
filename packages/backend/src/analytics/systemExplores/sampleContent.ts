import {
    CartesianSeriesType,
    ChartType,
    Compact,
    DashboardTileTypes,
    type ChartAsCode,
    type DashboardAsCode,
} from '@lightdash/common';
import { buildAiTokenDashboard } from './aiTokenDashboard';
import { withAnalyticsChartPresentation } from './analyticsChartPresentation';
import { withEmbedRankingPresentation } from './embedDashboard';
import type { LibraryChartBinding } from './libraryCharts';
import { buildQueryCalendarChart } from './queryCalendarChart';
import {
    buildUsageDashboards,
    usageLibraryChartBindings,
    wholeMillisecondOverrides,
} from './usageDashboards';

type SampleChart = Omit<
    ChartAsCode,
    'slug' | 'version' | 'spaceSlug' | 'dashboardSlug'
> & {
    key: string;
    libraryChart?: LibraryChartBinding;
};

const defaultChartDescription =
    'Based on all available usage events for this organization.';

const chart = (
    key: string,
    name: string,
    tableName: 'ai_usage' | 'query_events',
    metric: string,
    dimension?: string,
    options: {
        visualization?: 'line' | 'bar' | 'donut';
        description?: string;
        extraMetrics?: string[];
        seriesNames?: string[];
        colors?: string[];
        axisLabel?: string;
        libraryChart?: LibraryChartBinding;
    } = {},
): SampleChart => {
    const metricId = `${tableName}_${metric}`;
    const metrics = [
        metricId,
        ...(options.extraMetrics ?? []).map((field) => `${tableName}_${field}`),
    ];
    const dimensionId = dimension ? `${tableName}_${dimension}` : undefined;
    const isBar = options.visualization === 'bar';
    const result: SampleChart = {
        key,
        libraryChart: options.libraryChart,
        name,
        description: options.description ?? defaultChartDescription,
        tableName,
        metricQuery: {
            exploreName: tableName,
            dimensions: dimensionId ? [dimensionId] : [],
            metrics,
            metricOverrides: wholeMillisecondOverrides(metrics),
            filters: {},
            sorts: [
                {
                    fieldId: isBar ? metricId : (dimensionId ?? metricId),
                    descending: isBar,
                },
            ],
            limit: isBar ? 10 : 500,
            tableCalculations: [],
        },
        tableConfig: {
            columnOrder: [...(dimensionId ? [dimensionId] : []), ...metrics],
        },
        chartConfig: dimensionId
            ? {
                  type: ChartType.CARTESIAN,
                  config: {
                      layout: {
                          xField: dimensionId,
                          yField: metrics,
                          flipAxes: isBar,
                          connectNulls: false,
                      },
                      eChartsConfig: {
                          showAxisTicks: false,
                          legend: { show: metrics.length > 1 },
                          xAxis: [{ name: '', inverse: isBar }],
                          yAxis: [{ name: options.axisLabel ?? '', min: '0' }],
                          series: metrics.map((field, index) => ({
                              type: isBar
                                  ? CartesianSeriesType.BAR
                                  : CartesianSeriesType.LINE,
                              name: options.seriesNames?.[index] ?? name,
                              color: options.colors?.[index] ?? '#5C7CFA',
                              showSymbol: false,
                              smooth: false,
                              encode: {
                                  xRef: { field: dimensionId },
                                  yRef: { field },
                              },
                          })),
                      },
                  },
              }
            : {
                  type: ChartType.BIG_NUMBER,
                  config: {
                      selectedField: metricId,
                      style:
                          metric === 'unique_users' ? undefined : Compact.AUTO,
                      showBigNumberLabel: false,
                  },
              },
    };
    if (dimensionId && options.visualization === 'donut') {
        result.chartConfig = {
            type: ChartType.PIE,
            config: {
                groupFieldIds: [dimensionId],
                metricId,
                isDonut: true,
                showLegend: true,
                showPercentage: true,
                showValue: false,
                valueLabel: 'inside',
                groupLabelOverrides: {
                    true: 'Cache hit',
                    false: 'Cache miss',
                    True: 'Cache hit',
                    False: 'Cache miss',
                },
                groupColorOverrides: {
                    true: '#12B886',
                    false: '#5C7CFA',
                    True: '#12B886',
                    False: '#5C7CFA',
                },
            },
        };
    }
    return result;
};

/** Stable keys define project-scoped sync slugs; names are presentation only. */
const aiUsageContent = {
    key: 'lightdash-analytics-overview',
    spaceSlug: 'lightdash-usage-overview',
    name: 'AI usage',
    description:
        'AI calls, token consumption, adoption and model usage. Duplicate this dashboard to keep a customized copy separate from future built-in updates.',
    charts: [
        chart('ai-calls', 'AI calls', 'ai_usage', 'total_ai_calls', undefined, {
            libraryChart: {
                slug: 'big-number-with-sparkline-trend',
                minVersion: '0.7.1',
                fieldMapping: {
                    value: 'ai_usage_total_ai_calls',
                    sparklineMetric: 'ai_usage_total_ai_calls',
                    time: 'ai_usage_event_ts_day',
                },
                optionValues: {
                    valueAggregation: 'sum',
                    style: 'compact',
                    colorSparklineByTrend: false,
                    showLabel: true,
                    label: 'Selected period',
                    showCardBorder: false,
                    showCardShadow: false,
                },
                query: {
                    dimensions: ['ai_usage_event_ts_day'],
                    metrics: ['ai_usage_total_ai_calls'],
                    sorts: [
                        { fieldId: 'ai_usage_event_ts_day', descending: false },
                    ],
                    limit: 500,
                    description: defaultChartDescription,
                },
            },
        }),
        chart(
            'tokens',
            'Tokens used',
            'ai_usage',
            'total_tokens_used',
            undefined,
            {
                libraryChart: {
                    slug: 'big-number-with-sparkline-trend',
                    minVersion: '0.7.1',
                    fieldMapping: {
                        value: 'ai_usage_total_tokens_used',
                        sparklineMetric: 'ai_usage_total_tokens_used',
                        time: 'ai_usage_event_ts_day',
                    },
                    optionValues: {
                        valueAggregation: 'sum',
                        style: 'compact',
                        colorSparklineByTrend: false,
                        showLabel: true,
                        label: 'Selected period',
                        showCardBorder: false,
                        showCardShadow: false,
                    },
                    query: {
                        dimensions: ['ai_usage_event_ts_day'],
                        metrics: ['ai_usage_total_tokens_used'],
                        sorts: [
                            {
                                fieldId: 'ai_usage_event_ts_day',
                                descending: false,
                            },
                        ],
                        limit: 500,
                        description: defaultChartDescription,
                    },
                },
            },
        ),
        chart(
            'ai-users',
            'Users using AI',
            'ai_usage',
            'unique_users',
            undefined,
            {
                libraryChart: {
                    slug: 'big-number-with-sparkline-trend',
                    minVersion: '0.7.1',
                    fieldMapping: {
                        value: 'ai_usage_unique_users',
                        sparklineMetric: 'ai_usage_unique_users',
                        time: 'ai_usage_event_ts_day',
                    },
                    optionValues: {
                        valueAggregation: 'latest',
                        showComparison: false,
                        colorSparklineByTrend: false,
                        showLabel: true,
                        label: 'Latest day',
                        showCardBorder: false,
                        showCardShadow: false,
                    },
                    query: {
                        dimensions: ['ai_usage_event_ts_day'],
                        metrics: ['ai_usage_unique_users'],
                        sorts: [
                            {
                                fieldId: 'ai_usage_event_ts_day',
                                descending: false,
                            },
                        ],
                        limit: 500,
                        description:
                            'People who used AI on the latest day in the selected period, with the daily trend. A person active on several days is counted on each of those days.',
                    },
                },
            },
        ),
        chart(
            'output-tokens',
            'Output tokens',
            'ai_usage',
            'total_output_tokens',
            undefined,
            {
                libraryChart: {
                    slug: 'big-number-with-sparkline-trend',
                    minVersion: '0.7.1',
                    fieldMapping: {
                        value: 'ai_usage_total_output_tokens',
                        sparklineMetric: 'ai_usage_total_output_tokens',
                        time: 'ai_usage_event_ts_day',
                    },
                    optionValues: {
                        valueAggregation: 'sum',
                        style: 'compact',
                        colorSparklineByTrend: false,
                        showLabel: true,
                        label: 'Selected period',
                        showCardBorder: false,
                        showCardShadow: false,
                    },
                    query: {
                        dimensions: ['ai_usage_event_ts_day'],
                        metrics: ['ai_usage_total_output_tokens'],
                        sorts: [
                            {
                                fieldId: 'ai_usage_event_ts_day',
                                descending: false,
                            },
                        ],
                        limit: 500,
                        description: defaultChartDescription,
                    },
                },
            },
        ),
        chart(
            'ai-calls-by-day',
            'AI calls by day',
            'ai_usage',
            'total_ai_calls',
            'event_ts_day',
            {
                colors: ['#7950F2'],
                axisLabel: 'Calls',
                libraryChart: {
                    slug: 'customizable-cartesian-chart',
                    minVersion: '0.17.1',
                    fieldMapping: {
                        x: 'ai_usage_event_ts_day',
                        m1: 'ai_usage_total_ai_calls',
                        splitBy: 'ai_usage_model',
                    },
                    optionValues: {
                        seriesType: 'bar',
                        stack: 'normal',
                        xAxisType: 'time',
                        xTimeFormat: '{MMM} {d}',
                    },
                    query: {
                        dimensions: ['ai_usage_event_ts_day', 'ai_usage_model'],
                        metrics: ['ai_usage_total_ai_calls'],
                        sorts: [
                            { fieldId: 'ai_usage_model', descending: false },
                            {
                                fieldId: 'ai_usage_event_ts_day',
                                descending: false,
                            },
                        ],
                        limit: 5000,
                        description: defaultChartDescription,
                    },
                },
            },
        ),
        chart(
            'tokens-by-day',
            'Tokens used by day',
            'ai_usage',
            'total_tokens_used',
            'event_ts_day',
            {
                colors: ['#339AF0'],
                axisLabel: 'Tokens',
                libraryChart: {
                    slug: 'customizable-cartesian-chart',
                    minVersion: '0.17.1',
                    fieldMapping: {
                        x: 'ai_usage_event_ts_day',
                        m1: 'ai_usage_total_tokens_used',
                        splitBy: 'ai_usage_model',
                    },
                    optionValues: {
                        seriesType: 'bar',
                        stack: 'normal',
                        xAxisType: 'time',
                        xTimeFormat: '{MMM} {d}',
                    },
                    query: {
                        dimensions: ['ai_usage_event_ts_day', 'ai_usage_model'],
                        metrics: ['ai_usage_total_tokens_used'],
                        sorts: [
                            { fieldId: 'ai_usage_model', descending: false },
                            {
                                fieldId: 'ai_usage_event_ts_day',
                                descending: false,
                            },
                        ],
                        limit: 5000,
                        description: defaultChartDescription,
                    },
                },
            },
        ),
        chart(
            'tokens-by-model',
            'Which models consume the most tokens?',
            'ai_usage',
            'total_tokens_used',
            'model',
            {
                visualization: 'bar',
                colors: ['#7950F2'],
                axisLabel: 'Tokens',
                description:
                    'Top 10 models by total tokens, across all available events. Token volume is not monetary cost.',
            },
        ),
        chart(
            'calls-by-model',
            'Which models are called most often?',
            'ai_usage',
            'total_ai_calls',
            'model',
            {
                visualization: 'bar',
                colors: ['#339AF0'],
                axisLabel: 'Calls',
                description:
                    'Top 10 models by AI calls across all available events. Compare with token volume to distinguish frequent calls from token-heavy calls.',
            },
        ),
        chart(
            'tokens-by-feature',
            'Token use by feature',
            'ai_usage',
            'total_tokens_used',
            'feature',
            {
                visualization: 'bar',
                colors: ['#7950F2'],
                axisLabel: 'Tokens',
                description:
                    'Tokens by feature over the selected period. Token volume is not monetary cost.',
                libraryChart: {
                    slug: 'heatmap',
                    minVersion: '0.4.2',
                    fieldMapping: {
                        x: 'ai_usage_event_ts_day',
                        y: 'ai_usage_feature',
                        value: 'ai_usage_total_tokens_used',
                    },
                    optionValues: {},
                    query: {
                        dimensions: [
                            'ai_usage_feature',
                            'ai_usage_event_ts_day',
                        ],
                        metrics: ['ai_usage_total_tokens_used'],
                        sorts: [
                            {
                                fieldId: 'ai_usage_feature',
                                descending: false,
                            },
                            {
                                fieldId: 'ai_usage_event_ts_day',
                                descending: false,
                            },
                        ],
                        limit: 5000,
                        description:
                            'Tokens per feature per day over the selected period. Token volume is not monetary cost.',
                    },
                },
            },
        ),
    ],
};

// Overview tile positions by chart key.
const aiUsageTilePositions: Record<
    string,
    { x: number; y: number; w: number; h: number }
> = {
    'ai-calls': { x: 0, y: 0, w: 9, h: 3 },
    tokens: { x: 9, y: 0, w: 9, h: 3 },
    'ai-users': { x: 18, y: 0, w: 9, h: 3 },
    'output-tokens': { x: 27, y: 0, w: 9, h: 3 },
    'tokens-by-feature': { x: 0, y: 3, w: 36, h: 7 },
    'ai-calls-by-day': { x: 0, y: 10, w: 18, h: 7 },
    'tokens-by-day': { x: 18, y: 10, w: 18, h: 7 },
    'tokens-by-model': { x: 0, y: 17, w: 18, h: 8 },
    'calls-by-model': { x: 18, y: 17, w: 18, h: 8 },
};

export const analyticsSampleDashboards = [
    aiUsageContent,
    {
        key: 'lightdash-analytics-query-activity',
        spaceSlug: 'query-activity',
        name: 'Query activity',
        description:
            'Query volume, adoption, cache usage and warehouse execution performance. Duplicate this dashboard to keep a customized copy separate from future built-in updates.',
        charts: [
            chart(
                'queries',
                'Queries executed',
                'query_events',
                'total_queries',
                undefined,
                {
                    libraryChart: {
                        slug: 'big-number-with-sparkline-trend',
                        minVersion: '0.7.1',
                        fieldMapping: {
                            value: 'query_events_total_queries',
                            sparklineMetric: 'query_events_total_queries',
                            time: 'query_events_event_ts_day',
                        },
                        optionValues: {
                            valueAggregation: 'sum',
                            style: 'compact',
                            colorSparklineByTrend: false,
                            showLabel: true,
                            label: 'Selected period',
                            showCardBorder: false,
                            showCardShadow: false,
                        },
                        query: {
                            dimensions: ['query_events_event_ts_day'],
                            metrics: ['query_events_total_queries'],
                            sorts: [
                                {
                                    fieldId: 'query_events_event_ts_day',
                                    descending: false,
                                },
                            ],
                            limit: 500,
                            description: defaultChartDescription,
                        },
                    },
                },
            ),
            chart(
                'query-users',
                'Users running queries',
                'query_events',
                'unique_users',
                undefined,
                {
                    libraryChart: {
                        slug: 'big-number-with-sparkline-trend',
                        minVersion: '0.7.1',
                        fieldMapping: {
                            value: 'query_events_unique_users',
                            sparklineMetric: 'query_events_unique_users',
                            time: 'query_events_event_ts_day',
                        },
                        optionValues: {
                            valueAggregation: 'latest',
                            showComparison: false,
                            colorSparklineByTrend: false,
                            showLabel: true,
                            label: 'Latest day',
                            showCardBorder: false,
                            showCardShadow: false,
                        },
                        query: {
                            dimensions: ['query_events_event_ts_day'],
                            metrics: ['query_events_unique_users'],
                            sorts: [
                                {
                                    fieldId: 'query_events_event_ts_day',
                                    descending: false,
                                },
                            ],
                            limit: 500,
                            description:
                                'People who ran queries on the latest day in the selected period, with the daily trend. A person active on several days is counted on each of those days.',
                        },
                    },
                },
            ),
            chart(
                'avg-execution-time',
                'Average warehouse execution (ms)',
                'query_events',
                'avg_warehouse_execution_time_ms',
                undefined,
                {
                    libraryChart: {
                        slug: 'big-number-with-sparkline-trend',
                        minVersion: '0.7.1',
                        fieldMapping: {
                            value: 'query_events_avg_warehouse_execution_time_ms',
                            sparklineMetric:
                                'query_events_avg_warehouse_execution_time_ms',
                            time: 'query_events_event_ts_day',
                        },
                        optionValues: {
                            valueAggregation: 'latest',
                            showComparison: false,
                            colorSparklineByTrend: false,
                            showLabel: true,
                            label: 'Latest day',
                            showCardBorder: false,
                            showCardShadow: false,
                        },
                        query: {
                            dimensions: ['query_events_event_ts_day'],
                            metrics: [
                                'query_events_avg_warehouse_execution_time_ms',
                            ],
                            sorts: [
                                {
                                    fieldId: 'query_events_event_ts_day',
                                    descending: false,
                                },
                            ],
                            limit: 500,
                            description:
                                'Average warehouse execution time on the latest day in the selected period, with the daily trend.',
                        },
                    },
                },
            ),
            chart(
                'p90-execution-time',
                'P90 warehouse execution (ms)',
                'query_events',
                'p90_warehouse_execution_time_ms',
                undefined,
                {
                    libraryChart: {
                        slug: 'big-number-with-sparkline-trend',
                        minVersion: '0.7.1',
                        fieldMapping: {
                            value: 'query_events_p90_warehouse_execution_time_ms',
                            sparklineMetric:
                                'query_events_p90_warehouse_execution_time_ms',
                            time: 'query_events_event_ts_day',
                        },
                        optionValues: {
                            valueAggregation: 'latest',
                            showComparison: false,
                            colorSparklineByTrend: false,
                            showLabel: true,
                            label: 'Latest day',
                            showCardBorder: false,
                            showCardShadow: false,
                        },
                        query: {
                            dimensions: ['query_events_event_ts_day'],
                            metrics: [
                                'query_events_p90_warehouse_execution_time_ms',
                            ],
                            sorts: [
                                {
                                    fieldId: 'query_events_event_ts_day',
                                    descending: false,
                                },
                            ],
                            limit: 500,
                            description:
                                'P90 warehouse execution time on the latest day in the selected period, with the daily trend.',
                        },
                    },
                },
            ),
            chart(
                'queries-by-day',
                'Queries by day',
                'query_events',
                'total_queries',
                'event_ts_day',
                {
                    colors: ['#12B886'],
                    axisLabel: 'Queries',
                    libraryChart: {
                        slug: 'customizable-cartesian-chart',
                        minVersion: '0.17.1',
                        fieldMapping: {
                            x: 'query_events_event_ts_day',
                            m1: 'query_events_total_queries',
                            splitBy: 'query_events_context',
                        },
                        optionValues: {
                            seriesType: 'bar',
                            stack: 'normal',
                            xAxisType: 'time',
                            xTimeFormat: '{MMM} {d}',
                            splitTopN: 6,
                        },
                        query: {
                            dimensions: [
                                'query_events_event_ts_day',
                                'query_events_context',
                            ],
                            metrics: ['query_events_total_queries'],
                            sorts: [
                                {
                                    fieldId: 'query_events_context',
                                    descending: false,
                                },
                                {
                                    fieldId: 'query_events_event_ts_day',
                                    descending: false,
                                },
                            ],
                            limit: 5000,
                            description: `Queries per day, split by the six contexts that ran the most, with the rest grouped as Other. ${defaultChartDescription}`,
                        },
                    },
                },
            ),
            chart(
                'active-users-by-day',
                'Users running queries by day',
                'query_events',
                'unique_users',
                'event_ts_day',
                {
                    colors: ['#339AF0'],
                    axisLabel: 'Users',
                    description:
                        'Distinct users with query events each day. Daily distinct counts should not be summed to calculate period-wide unique users.',
                },
            ),
            chart(
                'query-cache',
                'How often are queries served from cache?',
                'query_events',
                'total_queries',
                'cache_hit',
                {
                    visualization: 'donut',
                    description:
                        'Share of query events by cache-hit flag. Missing flags remain a separate group rather than being treated as misses.',
                },
            ),
            chart(
                'queries-by-context',
                'Where are queries coming from?',
                'query_events',
                'total_queries',
                'context',
                {
                    visualization: 'bar',
                    colors: ['#339AF0'],
                    axisLabel: 'Queries',
                    description:
                        'Top 10 query contexts by volume across all available events.',
                },
            ),
            chart(
                'query-latency-by-day',
                'Is warehouse execution getting slower?',
                'query_events',
                'avg_warehouse_execution_time_ms',
                'event_ts_day',
                {
                    extraMetrics: ['p90_warehouse_execution_time_ms'],
                    seriesNames: ['Average', 'P90'],
                    colors: ['#12B886', '#F59F00'],
                    axisLabel: 'Milliseconds',
                    description:
                        'Daily average and 90th percentile warehouse execution time, in milliseconds. Missing timings are excluded; this is not end-to-end request latency.',
                },
            ),
        ],
    },
];

// Library chart bindings declared on sample charts, keyed by final chart slug.
export const legacyLibraryChartBindings = (
    bundles: { key: string; charts: SampleChart[] }[],
): Map<string, LibraryChartBinding> =>
    new Map(
        bundles.flatMap((bundle) =>
            bundle.charts.flatMap(
                ({ key, libraryChart }): [string, LibraryChartBinding][] =>
                    libraryChart
                        ? [[`${bundle.key}-${key}`, libraryChart]]
                        : [],
            ),
        ),
    );

const legacyContentAsCode: {
    dashboard: DashboardAsCode;
    charts: ChartAsCode[];
}[] = analyticsSampleDashboards.map((bundle) => {
    const { spaceSlug } = bundle;
    const charts: ChartAsCode[] = bundle.charts.map(
        ({ key, libraryChart, ...definition }) => ({
            ...definition,
            slug: `${bundle.key}-${key}`,
            dashboardSlug: bundle.key,
            spaceSlug,
            version: 1,
        }),
    );
    if (bundle.key === 'lightdash-analytics-query-activity') {
        const dailyQueries = charts.find(({ slug }) =>
            slug.endsWith('-queries-by-day'),
        )!;
        charts.push(buildQueryCalendarChart(dailyQueries));
    }
    return {
        charts,
        dashboard: {
            name: bundle.name,
            description: bundle.description,
            slug: bundle.key,
            spaceSlug,
            version: 1,
            tabs: [],
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
            tiles: charts.map(({ slug }, index) => {
                if (bundle.key === aiUsageContent.key) {
                    const key = slug.slice(bundle.key.length + 1);
                    const position = aiUsageTilePositions[key];
                    if (!position) {
                        throw new Error(
                            `No Overview position for chart ${key}`,
                        );
                    }
                    return {
                        uuid: undefined,
                        tileSlug: slug,
                        type: DashboardTileTypes.SAVED_CHART,
                        ...position,
                        tabSlug: null,
                        properties: { chartSlug: slug },
                    };
                }
                if (
                    bundle.key === 'lightdash-analytics-query-activity' &&
                    index >= 4
                ) {
                    const positions = [
                        { x: 0, y: 9, w: 18, h: 8 },
                        { x: 18, y: 9, w: 18, h: 8 },
                        { x: 0, y: 17, w: 18, h: 8 },
                        { x: 18, y: 17, w: 18, h: 8 },
                        { x: 0, y: 25, w: 36, h: 8 },
                        { x: 0, y: 3, w: 36, h: 6 },
                    ];
                    return {
                        uuid: undefined,
                        tileSlug: slug,
                        type: DashboardTileTypes.SAVED_CHART,
                        ...positions[index - 4],
                        tabSlug: null,
                        properties: { chartSlug: slug },
                    };
                }
                let width = index < 4 ? 9 : 18;
                if (
                    index >= 4 &&
                    index === charts.length - 1 &&
                    index % 2 === 0
                ) {
                    width = 36;
                }
                return {
                    uuid: undefined,
                    tileSlug: slug,
                    type: DashboardTileTypes.SAVED_CHART,
                    x: index < 4 ? index * 9 : ((index - 4) % 2) * 18,
                    y: index < 4 ? 0 : 3 + Math.floor((index - 4) / 2) * 8,
                    w: width,
                    h: index < 4 ? 3 : 8,
                    tabSlug: null,
                    properties: { chartSlug: slug },
                };
            }),
        },
    };
});

export const analyticsDefaultSpace = {
    slug: 'lightdash-analytics-default-dashboards',
    name: 'Default dashboards',
};

export const analyticsContentAsCode = [
    ...buildUsageDashboards(legacyContentAsCode),
    buildAiTokenDashboard(),
].map(({ dashboard, charts }) => ({
    dashboard: {
        ...dashboard,
        spaceSlug: analyticsDefaultSpace.slug,
        verified: true,
    },
    charts: charts.map((chartDefinition) => ({
        ...withEmbedRankingPresentation(
            withAnalyticsChartPresentation(chartDefinition),
        ),
        spaceSlug: analyticsDefaultSpace.slug,
    })),
}));

export const analyticsLibraryChartBindings: ReadonlyMap<
    string,
    LibraryChartBinding
> = new Map([
    ...usageLibraryChartBindings,
    ...legacyLibraryChartBindings(analyticsSampleDashboards),
]);
