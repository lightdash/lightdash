import {
    AiChartType,
    AiMetricQuery,
    filtersSchema,
    filtersSchemaTransformed,
    FollowUpTools,
    MetricQuery,
    timeSeriesMetricVizConfigSchema,
} from '@lightdash/common';
import { z } from 'zod';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { getPivotedResults } from '../utils/getPivotedResults';
import { getValidAiQueryLimit } from '../utils/validators';

export const timeSeriesVizToolSchema = z.object({
    type: z.literal(AiChartType.TIME_SERIES_CHART),
    vizConfig: timeSeriesMetricVizConfigSchema,
    filters: filtersSchema
        .nullable()
        .describe(
            'Filters to apply to the query. Filtered fields must exist in the selected explore.',
        ),
    followUpTools: z
        .array(
            z.union([
                z.literal(FollowUpTools.GENERATE_BAR_VIZ),
                z.literal(FollowUpTools.GENERATE_TIME_SERIES_VIZ),
            ]),
        )
        .describe(
            `The actions the User can ask for after the AI has generated the chart. NEVER include ${FollowUpTools.GENERATE_TIME_SERIES_VIZ} in this list.`,
        ),
});

export type TimeSeriesVizTool = z.infer<typeof timeSeriesVizToolSchema>;

export const isTimeSeriesVizTool = (
    config: unknown,
): config is TimeSeriesVizTool =>
    timeSeriesVizToolSchema
        .omit({ type: true, followUpTools: true })
        .safeParse(config).success;

export const metricQueryTimeSeriesChartMetric = (
    config: Pick<TimeSeriesVizTool, 'vizConfig' | 'filters'>,
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

export const echartsConfigTimeSeriesMetric = async (
    vizTool: Pick<TimeSeriesVizTool, 'vizConfig' | 'filters'>,
    rows: Record<string, unknown>[],
    fieldsMap: Record<string, unknown>,
    sorts: MetricQuery['sorts'],
) => {
    let chartData = rows;
    let metrics = vizTool.vizConfig.yMetrics;
    if (vizTool.vizConfig.breakdownByDimension) {
        // Sort the pivoted data
        const pivoted = await getPivotedResults(
            rows,
            fieldsMap,
            vizTool.vizConfig.breakdownByDimension,
            vizTool.vizConfig.yMetrics,
            sorts,
        );
        chartData = pivoted.results;
        metrics = pivoted.metrics;
    }

    return {
        ...(vizTool.vizConfig.title
            ? { title: { text: vizTool.vizConfig.title } }
            : {}),
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
                x: vizTool.vizConfig.xDimension,
                y: metric,
            },
            ...(vizTool.vizConfig.lineType === 'area' && { areaStyle: {} }),
        })),
    };
};

export const renderTimeSeriesViz = async ({
    runMetricQuery,
    vizTool,
}: {
    runMetricQuery: (
        metricQuery: AiMetricQuery,
    ) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
    vizTool: Pick<TimeSeriesVizTool, 'vizConfig' | 'filters'>;
}): Promise<{
    type: AiChartType.TIME_SERIES_CHART;
    metricQuery: AiMetricQuery;
    results: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    chartOptions: object;
}> => {
    const metricQuery = metricQueryTimeSeriesChartMetric(vizTool);
    const results = await runMetricQuery(metricQuery);
    const chartOptions = await echartsConfigTimeSeriesMetric(
        vizTool,
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
