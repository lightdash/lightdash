import {
    CartesianSeriesType,
    ChartType,
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
): SampleChart => {
    const metricId = `${tableName}_${metric}`;
    const dimensionId = dimension ? `${tableName}_${dimension}` : undefined;
    return {
        key,
        name,
        description:
            'Based on the available usage events for this organization.',
        tableName,
        metricQuery: {
            exploreName: tableName,
            dimensions: dimensionId ? [dimensionId] : [],
            metrics: [metricId],
            filters: {},
            sorts: [{ fieldId: dimensionId ?? metricId, descending: false }],
            limit: 500,
            tableCalculations: [],
        },
        tableConfig: {
            columnOrder: [...(dimensionId ? [dimensionId] : []), metricId],
        },
        chartConfig: dimensionId
            ? {
                  type: ChartType.CARTESIAN,
                  config: {
                      layout: { xField: dimensionId, yField: [metricId] },
                      eChartsConfig: {
                          series: [
                              {
                                  type: CartesianSeriesType.BAR,
                                  encode: {
                                      xRef: { field: dimensionId },
                                      yRef: { field: metricId },
                                  },
                              },
                          ],
                      },
                  },
              }
            : {
                  type: ChartType.BIG_NUMBER,
                  config: { selectedField: metricId },
              },
    };
};

/** Stable keys identify managed items; names and slugs are presentation only. */
export const analyticsSampleContent = {
    key: 'lightdash-analytics-overview',
    version: 1,
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
        ),
        chart(
            'queries-by-day',
            'Queries by day',
            'query_events',
            'total_queries',
            'event_ts_day',
        ),
    ],
};
