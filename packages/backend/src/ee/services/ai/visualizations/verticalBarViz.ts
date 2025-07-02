import {
    AiChartType,
    AiMetricQuery,
    filtersSchema,
    filtersSchemaTransformed,
    FollowUpTools,
    MetricQuery,
    verticalBarMetricVizConfigSchema,
} from '@lightdash/common';
import { z } from 'zod';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { getPivotedResults } from '../utils/getPivotedResults';
import { getValidAiQueryLimit } from '../utils/validators';

export const verticalBarVizToolSchema = z.object({
    type: z.literal(AiChartType.VERTICAL_BAR_CHART),
    vizConfig: verticalBarMetricVizConfigSchema,
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
            `The actions the User can ask for after the AI has generated the chart. NEVER include ${FollowUpTools.GENERATE_BAR_VIZ} in this list.`,
        ),
});

export type VerticalBarVizTool = z.infer<typeof verticalBarVizToolSchema>;

export const isVerticalBarVizTool = (
    config: unknown,
): config is VerticalBarVizTool =>
    verticalBarVizToolSchema
        .omit({ type: true, followUpTools: true })
        .safeParse(config).success;

export const metricQueryVerticalBarChartMetric = (
    config: Pick<VerticalBarVizTool, 'vizConfig' | 'filters'>,
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
    vizTool: Pick<VerticalBarVizTool, 'vizConfig' | 'filters'>,
    rows: Record<string, unknown>[],
    fieldsMap: Record<string, unknown>,
    sorts: MetricQuery['sorts'],
) => {
    let chartData = rows;
    let metrics = vizTool.vizConfig.yMetrics;
    if (vizTool.vizConfig.breakdownByDimension) {
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
    const fields = Object.keys(chartData[0] || {});
    return {
        dataset: {
            source: chartData,
            dimensions: fields,
        },
        ...(vizTool.vizConfig.title
            ? { title: { text: vizTool.vizConfig.title } }
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
                type: vizTool.vizConfig.xAxisType,
                ...(vizTool.vizConfig.xAxisLabel
                    ? { name: vizTool.vizConfig.xAxisLabel }
                    : {}),
            },
        ],
        yAxis: [
            {
                type: 'value',
                ...(vizTool.vizConfig.yAxisLabel
                    ? { name: vizTool.vizConfig.yAxisLabel }
                    : {}),
            },
        ],
        series: metrics.map((metric) => ({
            type: 'bar',
            name: metric,
            encode: {
                x: vizTool.vizConfig.xDimension,
                y: metric,
            },
            ...(vizTool.vizConfig.stackBars ? { stack: 'stack' } : {}),
        })),
    };
};

export const renderVerticalBarViz = async ({
    runMetricQuery,
    vizTool,
}: {
    runMetricQuery: (
        metricQuery: AiMetricQuery,
    ) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
    vizTool: Pick<VerticalBarVizTool, 'vizConfig' | 'filters'>;
}): Promise<{
    type: AiChartType.VERTICAL_BAR_CHART;
    results: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >;
    metricQuery: AiMetricQuery;
    chartOptions: object;
}> => {
    const metricQuery = metricQueryVerticalBarChartMetric(vizTool);
    const results = await runMetricQuery(metricQuery);
    const chartOptions = await echartsConfigVerticalBarMetric(
        vizTool,
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
