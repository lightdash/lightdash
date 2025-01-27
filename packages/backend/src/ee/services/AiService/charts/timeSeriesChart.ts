import { FilterSchema, MetricQuery, SortFieldSchema } from '@lightdash/common';
import { z } from 'zod';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { MiniMetricQuery } from '../runMiniMetricQuery/runMiniMetricQuery';
import {
    FollowUpTools,
    followUpToolsSchema,
} from '../utils/aiCopilot/followUpTools';
import {
    AI_DEFAULT_MAX_QUERY_LIMIT,
    getValidAiQueryLimit,
} from '../utils/aiCopilot/validators';
import { getPivotedResults } from './getPivotedResults';
import { renderEcharts } from './renderEcharts';

export const timeSeriesMetricChartConfigSchema = z.object({
    title: z
        .string()
        .describe(
            '(optional) The title of the chart. If not provided the chart will have no title.',
        )
        .optional(),
    exploreName: z
        .string()
        .describe(
            'The name of the explore containing the metrics and dimensions used for the chart.',
        ),
    xDimension: z
        .string()
        .describe(
            'The field id of the time dimension to be displayed on the x-axis.',
        ),
    yMetrics: z
        .array(z.string())
        .min(1)
        .describe(
            'At least one metric is required. The field ids of the metrics to be displayed on the y-axis. If there are multiple metrics there will be one line per metric',
        ),
    sorts: z
        .array(SortFieldSchema)
        .describe(
            'Sort configuration for the query, it can use a combination of metrics and dimensions.',
        ),
    breakdownByDimension: z
        .string()
        .optional()
        .nullable()
        .describe(
            '(optional) The field id of the dimension used to split the metrics into series for each dimension value. For example if you wanted to split a metric into multiple series based on City you would use the City dimension field id here. If this is not provided then the metric will be displayed as a single series.',
        ),
    lineType: z
        .union([z.literal('line'), z.literal('area')])
        .describe(
            '(optional) default line. The type of line to display. If area then the area under the line will be filled in.',
        )
        .default('line'),
    limit: z
        .number()
        .max(AI_DEFAULT_MAX_QUERY_LIMIT)
        .optional()
        .describe(
            `(optional, max: ${AI_DEFAULT_MAX_QUERY_LIMIT}) The total number of data points allowed on the chart.`,
        ),
    followUpTools: followUpToolsSchema.describe(
        `The actions the User can ask for after the AI has generated the chart. NEVER include ${FollowUpTools.GENERATE_TIME_SERIES_VIZ} in this list.`,
    ),
});

export const generateTimeSeriesVizConfigToolSchema = z.object({
    vizConfig: timeSeriesMetricChartConfigSchema,
    filters: FilterSchema.optional().describe(
        'Filters to apply to the query. Filtered fields must exist in the selected explore.',
    ),
});

type TimeSeriesMetricChartConfig = z.infer<
    typeof timeSeriesMetricChartConfigSchema
>;

export const metricQueryTimeSeriesChartMetric = (
    config: TimeSeriesMetricChartConfig,
    filters: z.infer<typeof FilterSchema> = {},
): MiniMetricQuery => {
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
        metricQuery: MiniMetricQuery,
    ) => ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>;
    vizConfig: TimeSeriesMetricChartConfig;
    filters?: z.infer<typeof FilterSchema>;
};

export const renderTimeseriesChart = async ({
    runMetricQuery,
    vizConfig,
    filters,
}: RenderTimeseriesChartArgs): Promise<{
    file: Buffer;
    metricQuery: MiniMetricQuery;
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
        file: await renderEcharts(chartOptions),
        metricQuery,
    };
};
