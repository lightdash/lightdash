import {
    CartesianSeriesType,
    ChartType,
    Compact,
    DashboardTileTypes,
    type ChartAsCode,
    type DashboardAsCode,
} from '@lightdash/common';

type SampleChart = Omit<
    ChartAsCode,
    'slug' | 'version' | 'spaceSlug' | 'dashboardSlug'
> & {
    key: string;
};

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
        name,
        description:
            options.description ??
            'Based on all available usage events for this organization.',
        tableName,
        metricQuery: {
            exploreName: tableName,
            dimensions: dimensionId ? [dimensionId] : [],
            metrics,
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
        chart('ai-calls', 'AI calls', 'ai_usage', 'total_ai_calls'),
        chart('tokens', 'Tokens used', 'ai_usage', 'total_tokens_used'),
        chart('ai-users', 'Users using AI', 'ai_usage', 'unique_users'),
        chart(
            'output-tokens',
            'Output tokens',
            'ai_usage',
            'total_output_tokens',
        ),
        chart(
            'ai-calls-by-day',
            'AI calls by day',
            'ai_usage',
            'total_ai_calls',
            'event_ts_day',
            { colors: ['#7950F2'], axisLabel: 'Calls' },
        ),
        chart(
            'tokens-by-day',
            'Tokens used by day',
            'ai_usage',
            'total_tokens_used',
            'event_ts_day',
            { colors: ['#339AF0'], axisLabel: 'Tokens' },
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
    ],
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
            ),
            chart(
                'query-users',
                'Users running queries',
                'query_events',
                'unique_users',
            ),
            chart(
                'avg-execution-time',
                'Average warehouse execution (ms)',
                'query_events',
                'avg_warehouse_execution_time_ms',
            ),
            chart(
                'p90-execution-time',
                'P90 warehouse execution (ms)',
                'query_events',
                'p90_warehouse_execution_time_ms',
            ),
            chart(
                'queries-by-day',
                'Queries by day',
                'query_events',
                'total_queries',
                'event_ts_day',
                { colors: ['#12B886'], axisLabel: 'Queries' },
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

export const analyticsContentAsCode: {
    dashboard: DashboardAsCode;
    charts: ChartAsCode[];
}[] = analyticsSampleDashboards.map((bundle) => {
    const { spaceSlug } = bundle;
    const charts = bundle.charts.map(({ key, ...definition }) => ({
        ...definition,
        slug: `${bundle.key}-${key}`,
        dashboardSlug: bundle.key,
        spaceSlug,
        version: 1,
    }));
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
