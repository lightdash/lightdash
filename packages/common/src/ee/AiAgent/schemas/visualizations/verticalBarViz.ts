import { z } from 'zod';
import { type TableCalculation } from '../../../../types/field';
import type { Filters } from '../../../../types/filter';
import { AI_DEFAULT_MAX_QUERY_LIMIT } from '../../constants';
import type { AiMetricQueryWithFilters } from '../../types';
import { getValidAiQueryLimit } from '../../validators';
import { getFieldIdSchema } from '../fieldId';
import sortFieldSchema from '../sortField';
import type { ToolVerticalBarArgsTransformed } from '../tools';

export const verticalBarMetricVizConfigSchema = z.object({
    exploreName: z
        .string()
        .describe(
            'The name of the explore containing the metrics and dimensions used for the chart.',
        ),
    xDimension: getFieldIdSchema({
        additionalDescription:
            'The field id of the dimension to be displayed on the x-axis.',
    }),
    yMetrics: z
        .array(getFieldIdSchema({ additionalDescription: null }))
        .min(1)
        .describe(
            'The field ids of the metrics to be displayed on the y-axis. The height of the bars',
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
    breakdownByDimension: getFieldIdSchema({
        additionalDescription:
            'The field id of the dimension used to split the metrics into groups along the x-axis. If stacking is false then this will create multiple bars around each x value, if stacking is true then this will create multiple bars for each metric stacked on top of each other',
    }).nullable(),
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

export const metricQueryVerticalBarViz = ({
    vizConfig,
    filters,
    maxLimit,
    customMetrics,
    tableCalculations,
}: {
    vizConfig: VerticalBarMetricVizConfigSchemaType;
    filters: Filters;
    maxLimit: number;
    customMetrics: ToolVerticalBarArgsTransformed['customMetrics'] | null;
    tableCalculations: TableCalculation[];
}): AiMetricQueryWithFilters => {
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
        sorts: sorts.map((sort) => ({
            ...sort,
            nullsFirst: sort.nullsFirst ?? undefined,
        })),
        exploreName: vizConfig.exploreName,
        filters,
        additionalMetrics: customMetrics ?? [],
        // TODO: add tableCalculations
        tableCalculations,
    };
};
