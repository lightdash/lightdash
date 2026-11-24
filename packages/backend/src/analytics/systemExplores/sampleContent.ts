import {
    CartesianSeriesType,
    ChartType,
    Compact,
    DashboardTileTypes,
    type ChartAsCode,
    type DashboardAsCode,
} from '@lightdash/common';
import {
    aiTokenLibraryChartBindings,
    buildAiTokenDashboard,
} from './aiTokenDashboard';
import {
    caution,
    positive,
    withAnalyticsChartPresentation,
} from './analyticsChartPresentation';
import {
    analyticsColorPalette,
    modelProviderColors,
    modelTierRanks,
} from './analyticsColorPalette';
import { heatmapColorClamp, heatmapColorClampNote } from './chartBuilders';
import { withEmbedRankingPresentation } from './embedDashboard';
import { trendRows } from './homeDashboard';
import type { LibraryChartBinding } from './libraryCharts';
import { noteRows } from './noteLayout';
import { buildQueryCalendarChart } from './queryCalendarChart';
import {
    buildUsageDashboards,
    compactAxisOverrides,
    note,
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
        // Big number only: show the latest day in the period, not the whole period.
        latestDay?: boolean;
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
        description: options.description ?? '',
        tableName,
        metricQuery: {
            exploreName: tableName,
            dimensions: dimensionId ? [dimensionId] : [],
            metrics,
            metricOverrides: {
                ...(dimensionId && options.visualization !== 'donut'
                    ? compactAxisOverrides(metrics)
                    : {}),
                ...wholeMillisecondOverrides(metrics),
            },
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
                          // A blank name falls back to the raw field label.
                          xAxis: [
                              {
                                  name:
                                      dimension === 'event_ts_day' ? 'Day' : '',
                                  inverse: isBar,
                              },
                          ],
                          yAxis: [{ name: options.axisLabel ?? '', min: '0' }],
                          series: metrics.map((field, index) => ({
                              type: isBar
                                  ? CartesianSeriesType.BAR
                                  : CartesianSeriesType.LINE,
                              name:
                                  options.seriesNames?.[index] ??
                                  options.axisLabel ??
                                  name,
                              color:
                                  options.colors?.[index] ??
                                  analyticsColorPalette.colors[0],
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
    if (!dimensionId && options.latestDay) {
        // A big number reads the first row, so one row for the newest day is all it needs.
        const dayId = `${tableName}_event_ts_day`;
        result.metricQuery = {
            ...result.metricQuery,
            dimensions: [dayId],
            sorts: [{ fieldId: dayId, descending: true }],
            limit: 1,
        };
        result.tableConfig = { columnOrder: [dayId, ...metrics] };
    }
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
                    true: positive,
                    false: caution,
                    True: positive,
                    False: caution,
                },
            },
        };
    }
    return result;
};

// The models as horizontal bars in the order of the query, each in the colour of its provider.
const modelRanking = (metric: string): LibraryChartBinding => ({
    slug: 'customizable-cartesian-chart',
    minVersion: '0.18.8',
    fieldMapping: { x: 'ai_usage_model_name', m1: metric },
    optionValues: {
        seriesType: 'bar',
        orientation: 'horizontal',
        splitColorGroups: modelProviderColors,
        splitShadeRank: modelTierRanks,
        showDataLabels: true,
        lightdashLabels: false,
        showAxisTitles: false,
        showLegend: true,
        legendPosition: 'bottom',
    },
    // Shares the plain chart's query: the ten largest, largest first
    query: null,
});

/** Stable keys define project-scoped sync slugs; names are presentation only. */
// The token tiles that follow the Date filter: the Any period tab of AI token usage. They were the
// first tab of Agents & AI, which is why this is built here and joined to the month-to-date tabs below.
const aiUsageContent = {
    key: 'lightdash-analytics-ai-tokens',
    spaceSlug: 'lightdash-usage-overview',
    name: 'AI usage',
    description:
        'AI calls, token consumption, adoption and model usage. Duplicate this dashboard to keep a customized copy separate from future built-in updates.',
    charts: [
        chart('ai-calls', 'AI calls', 'ai_usage', 'total_ai_calls', undefined, {
            description:
                'AI calls in the selected period. One agent request can make several AI calls.',
            libraryChart: {
                slug: 'big-number-with-sparkline-trend',
                minVersion: '0.8.4',
                fieldMapping: {
                    value: 'ai_usage_total_ai_calls',
                    sparklineMetric: 'ai_usage_total_ai_calls',
                    time: 'ai_usage_event_ts_day',
                },
                optionValues: {
                    valueAggregation: 'sum',
                    showComparison: false,
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
                    description:
                        'AI calls in the selected period. One agent request can make several AI calls.',
                },
            },
        }),
        chart(
            'tokens',
            'Tokens (all usage)',
            'ai_usage',
            'total_tokens_used',
            undefined,
            {
                description: 'Tokens used in the selected period.',
                libraryChart: {
                    slug: 'big-number-with-sparkline-trend',
                    minVersion: '0.8.4',
                    fieldMapping: {
                        value: 'ai_usage_total_tokens_used',
                        sparklineMetric: 'ai_usage_total_tokens_used',
                        time: 'ai_usage_event_ts_day',
                    },
                    optionValues: {
                        valueAggregation: 'sum',
                        showComparison: false,
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
                        description: 'Tokens used in the selected period.',
                    },
                },
            },
        ),
        chart(
            'ai-users',
            'People using AI',
            'ai_usage',
            'unique_users',
            undefined,
            {
                latestDay: true,
                description:
                    'People who used AI on the latest day in the selected period.',
                libraryChart: {
                    slug: 'big-number-with-sparkline-trend',
                    minVersion: '0.8.4',
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
                description: 'Output tokens in the selected period.',
                libraryChart: {
                    slug: 'big-number-with-sparkline-trend',
                    minVersion: '0.8.4',
                    fieldMapping: {
                        value: 'ai_usage_total_output_tokens',
                        sparklineMetric: 'ai_usage_total_output_tokens',
                        time: 'ai_usage_event_ts_day',
                    },
                    optionValues: {
                        valueAggregation: 'sum',
                        showComparison: false,
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
                        description: 'Output tokens in the selected period.',
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
                axisLabel: 'AI calls',
                description: '',
                libraryChart: {
                    slug: 'customizable-cartesian-chart',
                    minVersion: '0.18.8',
                    fieldMapping: {
                        x: 'ai_usage_event_ts_day',
                        m1: 'ai_usage_total_ai_calls',
                        splitBy: 'ai_usage_model_name',
                    },
                    optionValues: {
                        seriesType: 'bar',
                        stack: 'normal',
                        splitSort: 'total',
                        splitColorGroups: modelProviderColors,
                        splitShadeRank: modelTierRanks,
                        // Three providers fit the legend; ten models needed a pager
                        legendMode: 'groups',
                        xAxisType: 'time',
                        xTimeFormat: '{MMM} {d}',
                        xName: 'Day',
                        yName: 'AI calls',
                    },
                    query: {
                        dimensions: [
                            'ai_usage_event_ts_day',
                            'ai_usage_model_name',
                        ],
                        metrics: ['ai_usage_total_ai_calls'],
                        sorts: [
                            {
                                fieldId: 'ai_usage_model_name',
                                descending: false,
                            },
                            {
                                fieldId: 'ai_usage_event_ts_day',
                                descending: false,
                            },
                        ],
                        limit: 5000,
                        description: '',
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
                description: '',
                libraryChart: {
                    slug: 'customizable-cartesian-chart',
                    minVersion: '0.18.8',
                    fieldMapping: {
                        x: 'ai_usage_event_ts_day',
                        m1: 'ai_usage_total_tokens_used',
                        splitBy: 'ai_usage_model_name',
                    },
                    optionValues: {
                        seriesType: 'bar',
                        stack: 'normal',
                        splitSort: 'total',
                        splitColorGroups: modelProviderColors,
                        splitShadeRank: modelTierRanks,
                        // Three providers fit the legend; ten models needed a pager
                        legendMode: 'groups',
                        xAxisType: 'time',
                        xTimeFormat: '{MMM} {d}',
                        xName: 'Day',
                        yName: 'Tokens',
                    },
                    query: {
                        dimensions: [
                            'ai_usage_event_ts_day',
                            'ai_usage_model_name',
                        ],
                        metrics: ['ai_usage_total_tokens_used'],
                        sorts: [
                            {
                                fieldId: 'ai_usage_model_name',
                                descending: false,
                            },
                            {
                                fieldId: 'ai_usage_event_ts_day',
                                descending: false,
                            },
                        ],
                        limit: 5000,
                        description: '',
                    },
                },
            },
        ),
        chart(
            'tokens-by-model',
            'Tokens by model (top 10)',
            'ai_usage',
            'total_tokens_used',
            'model_name',
            {
                visualization: 'bar',
                colors: ['#7950F2'],
                axisLabel: 'Tokens',
                // Ranked bars, largest at the top, coloured by provider
                libraryChart: modelRanking('ai_usage_total_tokens_used'),
                description:
                    'Top 10 models by total tokens in the selected period.',
            },
        ),
        chart(
            'calls-by-model',
            'AI calls by model (top 10)',
            'ai_usage',
            'total_ai_calls',
            'model_name',
            {
                visualization: 'bar',
                colors: ['#339AF0'],
                axisLabel: 'AI calls',
                // Ranked bars, largest at the top, coloured by provider
                libraryChart: modelRanking('ai_usage_total_ai_calls'),
                description:
                    'Top 10 models by AI calls in the selected period. Compare with tokens by model to tell frequent calls from token-heavy calls.',
            },
        ),
        chart(
            'tokens-by-feature',
            'Tokens by feature',
            'ai_usage',
            'total_tokens_used',
            'feature_name',
            {
                visualization: 'bar',
                colors: ['#7950F2'],
                axisLabel: 'Tokens',
                description: 'Tokens by feature in the selected period.',
                libraryChart: {
                    slug: 'heatmap',
                    minVersion: '0.5.1',
                    fieldMapping: {
                        x: 'ai_usage_event_ts_day',
                        y: 'ai_usage_feature_name',
                        value: 'ai_usage_total_tokens_used',
                    },
                    optionValues: {
                        xTitle: 'Day',
                        yTitle: 'Feature',
                        legendTitle: 'Tokens',
                        legendFormat: 'compact',
                        ...heatmapColorClamp,
                    },
                    query: {
                        dimensions: [
                            'ai_usage_feature_name',
                            'ai_usage_event_ts_day',
                        ],
                        metrics: ['ai_usage_total_tokens_used'],
                        sorts: [
                            {
                                fieldId: 'ai_usage_feature_name',
                                descending: false,
                            },
                            {
                                fieldId: 'ai_usage_event_ts_day',
                                descending: false,
                            },
                        ],
                        limit: 5000,
                        description: `Tokens per feature per day in the selected period. ${heatmapColorClampNote}`,
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
    'ai-calls': { x: 0, y: 1, w: 9, h: 4 },
    tokens: { x: 9, y: 1, w: 9, h: 4 },
    'ai-users': { x: 18, y: 1, w: 9, h: 4 },
    'output-tokens': { x: 27, y: 1, w: 9, h: 4 },
    'tokens-by-feature': { x: 0, y: 5, w: 36, h: 7 },
    'ai-calls-by-day': { x: 0, y: 12, w: 18, h: 7 },
    'tokens-by-day': { x: 18, y: 12, w: 18, h: 7 },
    'tokens-by-model': { x: 0, y: 19, w: 18, h: 8 },
    'calls-by-model': { x: 18, y: 19, w: 18, h: 8 },
};
// One caption row above the Overview tiles, which start at y = 1.
// One vocabulary for the three token totals on this dashboard, and what tells them apart
const aiUsageOverviewCaption =
    '**This tab follows the Date filter and counts all usage.** The other tabs are fixed to the current month: Tokens (all usage) is the same measure for the month, and Tokens in billing scope is the part of it that counts towards billing.';

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
                'Queries run',
                'query_events',
                'total_queries',
                undefined,
                {
                    description: 'Queries run in the selected period.',
                    libraryChart: {
                        slug: 'big-number-with-sparkline-trend',
                        minVersion: '0.8.4',
                        fieldMapping: {
                            value: 'query_events_total_queries',
                            sparklineMetric: 'query_events_total_queries',
                            time: 'query_events_event_ts_day',
                        },
                        optionValues: {
                            valueAggregation: 'sum',
                            showComparison: false,
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
                            description: 'Queries run in the selected period.',
                        },
                    },
                },
            ),
            chart(
                'query-users',
                'People running queries',
                'query_events',
                'unique_users',
                undefined,
                {
                    latestDay: true,
                    description:
                        'People who ran queries on the latest day in the selected period. Service accounts are counted too.',
                    libraryChart: {
                        slug: 'big-number-with-sparkline-trend',
                        minVersion: '0.8.4',
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
                                'People who ran queries on the latest day in the selected period, with the daily trend. Service accounts are counted too.',
                        },
                    },
                },
            ),
            chart(
                'avg-execution-time',
                'Average warehouse execution (s)',
                'query_events',
                'avg_warehouse_execution_time_s',
                undefined,
                {
                    latestDay: true,
                    description:
                        'Average warehouse execution time on the latest day in the selected period.',
                    libraryChart: {
                        slug: 'big-number-with-sparkline-trend',
                        minVersion: '0.8.4',
                        fieldMapping: {
                            value: 'query_events_avg_warehouse_execution_time_s',
                            sparklineMetric:
                                'query_events_avg_warehouse_execution_time_s',
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
                                'query_events_avg_warehouse_execution_time_s',
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
                'P90 warehouse execution (s)',
                'query_events',
                'p90_warehouse_execution_time_s',
                undefined,
                {
                    latestDay: true,
                    description:
                        'P90 warehouse execution time on the latest day in the selected period.',
                    libraryChart: {
                        slug: 'big-number-with-sparkline-trend',
                        minVersion: '0.8.4',
                        fieldMapping: {
                            value: 'query_events_p90_warehouse_execution_time_s',
                            sparklineMetric:
                                'query_events_p90_warehouse_execution_time_s',
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
                                'query_events_p90_warehouse_execution_time_s',
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
                    description: '',
                    libraryChart: {
                        slug: 'customizable-cartesian-chart',
                        minVersion: '0.18.3',
                        fieldMapping: {
                            x: 'query_events_event_ts_day',
                            m1: 'query_events_total_queries',
                            splitBy: 'query_events_context_name',
                        },
                        optionValues: {
                            seriesType: 'bar',
                            stack: 'normal',
                            splitSort: 'total',
                            xAxisType: 'time',
                            xTimeFormat: '{MMM} {d}',
                            xName: 'Day',
                            yName: 'Queries',
                            splitTopN: 6,
                        },
                        query: {
                            dimensions: [
                                'query_events_event_ts_day',
                                'query_events_context_name',
                            ],
                            metrics: ['query_events_total_queries'],
                            sorts: [
                                {
                                    fieldId: 'query_events_context_name',
                                    descending: false,
                                },
                                {
                                    fieldId: 'query_events_event_ts_day',
                                    descending: false,
                                },
                            ],
                            limit: 5000,
                            description:
                                'Queries per day, split by the six places that ran the most queries, such as a dashboard view or an Explore, with the rest grouped as Other.',
                        },
                    },
                },
            ),
            chart(
                'active-users-by-day',
                'People running queries by day',
                'query_events',
                'unique_users',
                'event_ts_day',
                {
                    colors: ['#339AF0'],
                    axisLabel: 'People',
                    description:
                        'People who ran queries each day, including service accounts. Daily counts cannot be added up to get people for the whole period.',
                    // The same smooth filled line as People by day on the Overview dashboard
                    libraryChart: {
                        slug: 'vega-trellis',
                        minVersion: '0.6.2',
                        fieldMapping: {
                            x: 'query_events_event_ts_day',
                            value: 'query_events_unique_users',
                        },
                        optionValues: trendRows,
                        query: null,
                    },
                },
            ),
            chart(
                'query-cache',
                'Queries by cache hit',
                'query_events',
                'total_queries',
                // The plain-name field: queries with no cache information read Not recorded
                'cache_hit_name',
                {
                    visualization: 'donut',
                    description:
                        'Share of queries by whether they hit the cache. Queries with no cache information are a separate group, not counted as misses.',
                },
            ),
            chart(
                'queries-by-context',
                'Where queries run from (top 10)',
                'query_events',
                'total_queries',
                'context_name',
                {
                    visualization: 'bar',
                    colors: ['#339AF0'],
                    axisLabel: 'Queries',
                    description:
                        'The 10 places that ran the most queries in the selected period, such as a dashboard view, an Explore or a scheduled delivery.',
                },
            ),
            chart(
                'query-latency-by-day',
                'Warehouse time by day (average and P90)',
                'query_events',
                'avg_warehouse_execution_time_s',
                'event_ts_day',
                {
                    extraMetrics: ['p90_warehouse_execution_time_s'],
                    seriesNames: ['Average', 'P90'],
                    colors: ['#12B886', '#F59F00'],
                    axisLabel: 'Warehouse time (s)',
                    description:
                        'Average and P90 warehouse execution time per day, in seconds. This is warehouse time only, not end-to-end response time.',
                    // The same date axis ("Oct 21") as the charts above it
                    libraryChart: {
                        slug: 'customizable-cartesian-chart',
                        minVersion: '0.18.0',
                        fieldMapping: {
                            x: 'query_events_event_ts_day',
                            m1: 'query_events_avg_warehouse_execution_time_s',
                            m2: 'query_events_p90_warehouse_execution_time_s',
                        },
                        optionValues: {
                            seriesType: 'line',
                            showSymbols: true,
                            xAxisType: 'time',
                            xTimeFormat: '{MMM} {d}',
                            xName: 'Day',
                            yName: 'Warehouse time (s)',
                            m1Name: 'Average',
                            m2Name: 'P90',
                        },
                        query: null,
                    },
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
            tiles: [
                ...(bundle.key === aiUsageContent.key
                    ? [
                          note(
                              'overview',
                              0,
                              noteRows(aiUsageOverviewCaption),
                              aiUsageOverviewCaption,
                          ),
                      ]
                    : []),
                ...charts.map(
                    ({ slug }, index): DashboardAsCode['tiles'][number] => {
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
                            bundle.key ===
                                'lightdash-analytics-query-activity' &&
                            index >= 4
                        ) {
                            const positions = [
                                { x: 0, y: 10, w: 18, h: 8 },
                                { x: 18, y: 10, w: 18, h: 8 },
                                { x: 0, y: 18, w: 18, h: 8 },
                                { x: 18, y: 18, w: 18, h: 8 },
                                { x: 0, y: 26, w: 36, h: 8 },
                                { x: 0, y: 4, w: 36, h: 6 },
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
                            y:
                                index < 4
                                    ? 0
                                    : 4 + Math.floor((index - 4) / 2) * 8,
                            w: width,
                            h: index < 4 ? 4 : 8,
                            tabSlug: null,
                            properties: { chartSlug: slug },
                        };
                    },
                ),
            ],
        },
    };
});

export const analyticsDefaultSpace = {
    slug: 'lightdash-analytics-default-dashboards',
    name: 'Default dashboards',
};

const aiTokenDashboard = buildAiTokenDashboard();

// AI token usage is one dashboard built in two halves: the Any period tab (charts that follow the Date
// filter, laid out by buildUsageDashboards) and the month-to-date tabs (aiTokenDashboard). The Date and
// Project filters are switched off for every month-to-date chart, whose period is fixed.
const builtDashboards = buildUsageDashboards(legacyContentAsCode);
const anyPeriodTokens = builtDashboards.find(
    ({ dashboard }) => dashboard.slug === aiTokenDashboard.dashboard.slug,
)!;
const tokenDashboard = {
    dashboard: {
        ...aiTokenDashboard.dashboard,
        tabs: [
            ...anyPeriodTokens.dashboard.tabs,
            ...aiTokenDashboard.dashboard.tabs.map((tab) => ({
                ...tab,
                order: tab.order + anyPeriodTokens.dashboard.tabs.length,
            })),
        ],
        tiles: [
            ...anyPeriodTokens.dashboard.tiles,
            ...aiTokenDashboard.dashboard.tiles,
        ],
        filters: {
            metrics: [],
            tableCalculations: [],
            dimensions: (
                anyPeriodTokens.dashboard.filters?.dimensions ?? []
            ).map((filter) => ({
                ...filter,
                tileTargets: {
                    ...filter.tileTargets,
                    ...Object.fromEntries(
                        aiTokenDashboard.charts.map(({ slug }) => [
                            slug,
                            false as const,
                        ]),
                    ),
                },
            })),
        },
    },
    charts: [...anyPeriodTokens.charts, ...aiTokenDashboard.charts],
};

export const analyticsContentAsCode = [
    ...builtDashboards.filter((bundle) => bundle !== anyPeriodTokens),
    tokenDashboard,
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
    ...aiTokenLibraryChartBindings(aiTokenDashboard.charts),
]);
