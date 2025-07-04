import { z } from 'zod';
import type { Filters } from '../../../../types/filter';
import { AI_DEFAULT_MAX_QUERY_LIMIT } from '../../constants';
import type { AiMetricQueryWithFilters } from '../../types';
import { getValidAiQueryLimit } from '../../validators';
import sortFieldSchema from '../sortField';

export const verticalBarMetricVizConfigSchema = z.object({
    exploreName: z
        .string()
        .describe(
            'The name of the explore containing the metrics and dimensions used for the chart.',
        ),
    xDimension: z
        .string()
        .describe(
            'The field id of the dimension to be displayed on the x-axis.',
        ),
    yMetrics: z
        .array(z.string())
        .min(1)
        .describe(
            'At least one metric is required. The field ids of the metrics to be displayed on the y-axis. The height of the bars',
        ),
    sorts: z
        .array(sortFieldSchema)
        .describe(
            'Sort configuration for the query, it can use a combination of metrics and dimensions.',
        ),
    limit: z
        .number()
        .max(AI_DEFAULT_MAX_QUERY_LIMIT)
        .nullable()
        .describe(
            `The total number of data points / bars allowed on the chart.`,
        ),
    breakdownByDimension: z
        .string()
        .nullable()
        .describe(
            'The field id of the dimension used to split the metrics into groups along the x-axis. If stacking is false then this will create multiple bars around each x value, if stacking is true then this will create multiple bars for each metric stacked on top of each other',
        ),
    stackBars: z
        .boolean()
        .nullable()
        .describe(
            'If using breakdownByDimension then this will stack the bars on top of each other instead of side by side.',
        ),
    xAxisType: z
        .union([z.literal('category'), z.literal('time')])
        .describe(
            'The x-axis type can be categorical for string value or time if the dimension is a date or timestamp.',
        ),
    xAxisLabel: z
        .string()
        .nullable()
        .describe('A helpful label to explain the x-axis'),
    yAxisLabel: z
        .string()
        .nullable()
        .describe('A helpful label to explain the y-axis'),
});

export type VerticalBarMetricVizConfigSchemaType = z.infer<
    typeof verticalBarMetricVizConfigSchema
>;

export const metricQueryVerticalBarViz = (
    vizConfig: VerticalBarMetricVizConfigSchemaType,
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
