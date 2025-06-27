import {
    AiChartType,
    AiMetricQuery,
    filtersSchema,
    filtersSchemaTransformed,
    MetricQuery,
    verticalBarMetricVizConfigSchema,
} from '@lightdash/common';
import { z } from 'zod';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { FollowUpTools, followUpToolsSchema } from '../types/followUpTools';
import {
    AI_DEFAULT_MAX_QUERY_LIMIT,
    getValidAiQueryLimit,
} from '../utils/validators';
import { getPivotedResults } from './getPivotedResults';

const vizConfigSchema = verticalBarMetricVizConfigSchema.extend({
    limit: z
        .number()
        .max(AI_DEFAULT_MAX_QUERY_LIMIT)
        .nullable()
        .describe(
            `The total number of data points / bars allowed on the chart.`,
        ),
    followUpTools: followUpToolsSchema.describe(
        `The actions the User can ask for after the AI has generated the chart. NEVER include ${FollowUpTools.GENERATE_BAR_VIZ} in this list.`,
    ),
});

export const generateBarVizConfigToolSchema = z.object({
    vizConfig: vizConfigSchema,
    filters: filtersSchema
        .nullable()
        .describe(
            'Filters to apply to the query. Filtered fields must exist in the selected explore.',
        ),
});

export type VerticalBarMetricChartConfig = z.infer<typeof vizConfigSchema>;

export const isVerticalBarMetricChartConfig = (
    config: unknown,
): config is VerticalBarMetricChartConfig =>
    typeof config === 'object' && config !== null && 'xAxisType' in config;

export const metricQueryVerticalBarChartMetric = (
    config: VerticalBarMetricChartConfig,
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

const echartsConfigVerticalBarMetric = async (
    config: VerticalBarMetricChartConfig,
    rows: Record<string, unknown>[],
    fieldsMap: Record<string, unknown>,
    sorts: MetricQuery['sorts'],
) => {
    let chartData = rows;
    let metrics = config.yMetrics;
    if (config.breakdownByDimension) {
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
    const fields = Object.keys(chartData[0] || {});
    return {
        dataset: {
            source: chartData,
            dimensions: fields,
        },
        ...(config.title ? { title: { text: config.title } } : {}),
        animation: false,
        backgroundColor: '#fff',
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
        xAxis: [
            {
                type: config.xAxisType,
                ...(config.xAxisLabel ? { name: config.xAxisLabel } : {}),
            },
        ],
        yAxis: [
            {
                type: 'value',
                ...(config.yAxisLabel ? { name: config.yAxisLabel } : {}),
            },
        ],
        series: metrics.map((metric) => ({
            type: 'bar',
            name: metric,
            encode: {
                x: config.xDimension,
                y: metric,
            },
            ...(config.stackBars ? { stack: 'stack' } : {}),
        })),
    };
};

type RenderVerticalBarMetricChartArgs = {
    runMetricQuery: (
        metricQuery: AiMetricQuery,
    ) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
    vizConfig: VerticalBarMetricChartConfig;
    filters: z.infer<typeof filtersSchemaTransformed> | undefined;
};

export const renderVerticalBarMetricChart = async ({
    runMetricQuery,
    vizConfig,
    filters,
}: RenderVerticalBarMetricChartArgs): Promise<{
    type: AiChartType.VERTICAL_BAR_CHART;
    results: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    metricQuery: AiMetricQuery;
    chartOptions: object;
}> => {
    const metricQuery = metricQueryVerticalBarChartMetric(vizConfig, filters);
    const results = await runMetricQuery(metricQuery);
    const chartOptions = await echartsConfigVerticalBarMetric(
        vizConfig,
        results.rows,
        results.fields,
        metricQuery.sorts,
    );

    return {
        type: AiChartType.VERTICAL_BAR_CHART,
        metricQuery,
        results,
        chartOptions,
    };
};
