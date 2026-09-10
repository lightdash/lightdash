import {
    CartesianSeriesType,
    ChartType,
    Compact,
    type CreateChartInDashboard,
} from '@lightdash/common';

type SampleChart = Omit<CreateChartInDashboard, 'dashboardUuid'> & {
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

/** Stable keys identify managed items; names and slugs are presentation only. */
export const analyticsSampleContent = {
    key: 'lightdash-analytics-overview',
    name: 'Lightdash usage overview',
    description:
        'A starting point for exploring AI usage and query activity. Duplicate this dashboard to keep a customized copy separate from future sample updates.',
    charts: [
        chart('ai-calls', 'AI calls', 'ai_usage', 'total_ai_calls'),
        chart('tokens', 'Tokens used', 'ai_usage', 'total_tokens_used'),
        chart('queries', 'Queries executed', 'query_events', 'total_queries'),
        chart(
            'query-users',
            'Users running queries',
            'query_events',
            'unique_users',
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
            'queries-by-day',
            'Queries by day',
            'query_events',
            'total_queries',
            'event_ts_day',
            { colors: ['#12B886'], axisLabel: 'Queries' },
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
    ],
};
