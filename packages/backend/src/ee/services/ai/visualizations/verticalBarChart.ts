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
    type: z.literal(AiChartType.VERTICAL_BAR_CHART),
    vizConfig: vizConfigSchema,
    filters: filtersSchema
        .nullable()
        .describe(
            'Filters to apply to the query. Filtered fields must exist in the selected explore.',
        ),
});

export type VerticalBarMetricChartConfig = z.infer<
    typeof generateBarVizConfigToolSchema
>;

export const isVerticalBarMetricChartConfig = (
    config: unknown,
): config is VerticalBarMetricChartConfig =>
    generateBarVizConfigToolSchema.safeParse(config).success;

export const metricQueryVerticalBarChartMetric = (
    config: VerticalBarMetricChartConfig,
): AiMetricQuery => {
    const metrics = config.vizConfig.yMetrics;
    const dimensions = [
        config.vizConfig.xDimension,
        ...(config.vizConfig.breakdownByDimension
            ? [config.vizConfig.breakdownByDimension]
            : []),
    ];
    const { limit, sorts } = config.vizConfig;
    return {
        metrics,
        dimensions,
        limit: getValidAiQueryLimit(limit),
        sorts,
        exploreName: config.vizConfig.exploreName,
        filters: filtersSchemaTransformed.parse(config.filters),
    };
};

const echartsConfigVerticalBarMetric = async (
    config: VerticalBarMetricChartConfig,
    rows: Record<string, unknown>[],
    fieldsMap: Record<string, unknown>,
    sorts: MetricQuery['sorts'],
) => {
    let chartData = rows;
    let metrics = config.vizConfig.yMetrics;
    if (config.vizConfig.breakdownByDimension) {
        const pivoted = await getPivotedResults(
            rows,
            fieldsMap,
            config.vizConfig.breakdownByDimension,
            config.vizConfig.yMetrics,
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
        ...(config.vizConfig.title
            ? { title: { text: config.vizConfig.title } }
            : {}),
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
                type: config.vizConfig.xAxisType,
                ...(config.vizConfig.xAxisLabel
                    ? { name: config.vizConfig.xAxisLabel }
                    : {}),
            },
        ],
        yAxis: [
            {
                type: 'value',
                ...(config.vizConfig.yAxisLabel
                    ? { name: config.vizConfig.yAxisLabel }
                    : {}),
            },
        ],
        series: metrics.map((metric) => ({
            type: 'bar',
            name: metric,
            encode: {
                x: config.vizConfig.xDimension,
                y: metric,
            },
            ...(config.vizConfig.stackBars ? { stack: 'stack' } : {}),
        })),
    };
};

type RenderVerticalBarMetricChartArgs = {
    runMetricQuery: (
        metricQuery: AiMetricQuery,
    ) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
    config: VerticalBarMetricChartConfig;
};

export const renderVerticalBarMetricChart = async ({
    runMetricQuery,
    config,
}: RenderVerticalBarMetricChartArgs): Promise<{
    type: AiChartType.VERTICAL_BAR_CHART;
    results: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    metricQuery: AiMetricQuery;
    chartOptions: object;
}> => {
    const metricQuery = metricQueryVerticalBarChartMetric(config);
    const results = await runMetricQuery(metricQuery);
    const chartOptions = await echartsConfigVerticalBarMetric(
        config,
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
