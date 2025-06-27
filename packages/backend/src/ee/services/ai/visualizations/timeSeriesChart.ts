import {
    AiChartType,
    AiMetricQuery,
    filtersSchema,
    filtersSchemaTransformed,
    MetricQuery,
    timeSeriesMetricVizConfigSchema,
} from '@lightdash/common';
import { z } from 'zod';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { FollowUpTools, followUpToolsSchema } from '../types/followUpTools';
import {
    AI_DEFAULT_MAX_QUERY_LIMIT,
    getValidAiQueryLimit,
} from '../utils/validators';
import { getPivotedResults } from './getPivotedResults';

const vizConfigSchema = timeSeriesMetricVizConfigSchema.extend({
    limit: z
        .number()
        .max(AI_DEFAULT_MAX_QUERY_LIMIT)
        .nullable()
        .describe(`The total number of data points allowed on the chart.`),
    followUpTools: followUpToolsSchema.describe(
        `The actions the User can ask for after the AI has generated the chart. NEVER include ${FollowUpTools.GENERATE_TIME_SERIES_VIZ} in this list.`,
    ),
});

export const generateTimeSeriesVizConfigToolSchema = z.object({
    vizConfig: vizConfigSchema,
    filters: filtersSchema
        .nullable()
        .describe(
            'Filters to apply to the query. Filtered fields must exist in the selected explore.',
        ),
});

export type TimeSeriesMetricChartConfig = z.infer<typeof vizConfigSchema>;

export const isTimeSeriesMetricChartConfig = (
    config: unknown,
): config is TimeSeriesMetricChartConfig =>
    typeof config === 'object' && config !== null && 'lineType' in config;

export const metricQueryTimeSeriesChartMetric = (
    config: TimeSeriesMetricChartConfig,
    filters: z.infer<typeof filtersSchemaTransformed> = {},
): AiMetricQuery => {
    const metrics = config.yMetrics;
    const dimensions = [
        config.xDimension,
        ...(config.breakdownByDimension ? [config.breakdownByDimension] : []),
    ];
    const { limit, sorts } = config;

    return {
        metrics,
        dimensions,
        limit: getValidAiQueryLimit(limit),
        sorts,
        exploreName: config.exploreName,
        filters,
    };
};

export const echartsConfigTimeSeriesMetric = async (
    config: TimeSeriesMetricChartConfig,
    rows: Record<string, unknown>[],
    fieldsMap: Record<string, unknown>,
    sorts: MetricQuery['sorts'],
) => {
    let chartData = rows;
    let metrics = config.yMetrics;
    if (config.breakdownByDimension) {
        // Sort the pivoted data
        const pivoted = await getPivotedResults(
            rows,
            fieldsMap,
            config.breakdownByDimension,
            config.yMetrics,
            sorts,
        );
        chartData = pivoted.results;
        metrics = pivoted.metrics;
    }

    return {
        ...(config.title ? { title: { text: config.title } } : {}),
        ...(metrics.length > 1
            ? {
                  // This is needed so we don't have overlapping legend and grid
                  legend: {
                      top: 40,
                      left: 'left',
                  },
                  grid: {
                      top: 100,
                  },
              }
            : {}),
        dataset: {
            source: chartData,
            dimensions: Object.keys(chartData[0] || {}),
        },
        animation: false,
        backgroundColor: '#fff',
        xAxis: [
            {
                type: 'time',
            },
        ],
        yAxis: [
            {
                type: 'value',
            },
        ],
        series: metrics.map((metric) => ({
            type: 'line',
            name: metric,
            encode: {
                x: config.xDimension,
                y: metric,
            },
            ...(config.lineType === 'area' && { areaStyle: {} }),
        })),
    };
};

type RenderTimeseriesChartArgs = {
    runMetricQuery: (
        metricQuery: AiMetricQuery,
    ) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
    vizConfig: TimeSeriesMetricChartConfig;
    filters: z.infer<typeof filtersSchemaTransformed> | undefined;
};

export const renderTimeseriesChart = async ({
    runMetricQuery,
    vizConfig,
    filters = {},
}: RenderTimeseriesChartArgs): Promise<{
    type: AiChartType.TIME_SERIES_CHART;
    metricQuery: AiMetricQuery;
    results: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    chartOptions: object;
}> => {
    const metricQuery = metricQueryTimeSeriesChartMetric(vizConfig, filters);
    const results = await runMetricQuery(metricQuery);
    const chartOptions = await echartsConfigTimeSeriesMetric(
        vizConfig,
        results.rows,
        results.fields,
        metricQuery.sorts,
    );

    return {
        type: AiChartType.TIME_SERIES_CHART,
        metricQuery,
        results,
        chartOptions,
    };
};
