import { z } from 'zod';
import type { Filters } from '../../../../types/filter';
import { AI_DEFAULT_MAX_QUERY_LIMIT } from '../../constants';
import type { AiMetricQueryWithFilters } from '../../types';
import { getValidAiQueryLimit } from '../../validators';
import sortFieldSchema from '../sortField';

export const timeSeriesMetricVizConfigSchema = z.object({
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
        .array(sortFieldSchema)
        .describe(
            'Sort configuration for the query, it can use a combination of metrics and dimensions.',
        ),
    breakdownByDimension: z
        .string()
        .nullable()
        .describe(
            'The field id of the dimension used to split the metrics into series for each dimension value. For example if you wanted to split a metric into multiple series based on City you would use the City dimension field id here. If this is not provided then the metric will be displayed as a single series.',
        ),
    lineType: z
        .union([z.literal('line'), z.literal('area')])
        .describe(
            'default line. The type of line to display. If area then the area under the line will be filled in.',
        ),
    limit: z
        .number()
        .max(AI_DEFAULT_MAX_QUERY_LIMIT)
        .nullable()
        .describe(`The total number of data points allowed on the chart.`),
});

export type TimeSeriesMetricVizConfigSchemaType = z.infer<
    typeof timeSeriesMetricVizConfigSchema
>;

export const metricQueryTimeSeriesViz = (
    vizConfig: TimeSeriesMetricVizConfigSchemaType,
    filters: Filters,
    maxLimit: number,
): AiMetricQueryWithFilters => {
    const metrics = vizConfig.yMetrics;
    const dimensions = [
        vizConfig.xDimension,
        ...(vizConfig.breakdownByDimension
            ? [vizConfig.breakdownByDimension]
            : []),
    ];
    const { limit, sorts } = vizConfig;

    return {
        metrics,
        dimensions,
        limit: getValidAiQueryLimit(limit, maxLimit),
        sorts,
        exploreName: vizConfig.exploreName,
        filters,
    };
};
