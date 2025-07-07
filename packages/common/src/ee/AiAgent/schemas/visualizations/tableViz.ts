import { z } from 'zod';
import type { Filters } from '../../../../types/filter';
import type { AiMetricQueryWithFilters } from '../../types';
import { getValidAiQueryLimit } from '../../validators';
import sortFieldSchema from '../sortField';

export const tableVizConfigSchema = z
    .object({
        exploreName: z
            .string()
            .describe(
                'The name of the explore containing the metrics and dimensions used for table query',
            ),
        metrics: z
            .array(z.string())
            .describe(
                'The field ids of the metrics to be calculated for the table. They will be grouped by the dimensions.',
            ),
        dimensions: z
            .array(z.string())
            .nullable()
            .describe(
                'The field id for the dimensions to group the metrics by',
            ),
        sorts: z
            .array(sortFieldSchema)
            .describe(
                'Sort configuration for the query, it can use a combination of metrics and dimensions.',
            ),

        limit: z
            .number()
            .nullable()
            .describe('The maximum number of rows in the table.'),
    })
    .describe(
        'Configuration file for generating a table from a query with metrics and dimensions',
    );

export type TableVizConfigSchemaType = z.infer<typeof tableVizConfigSchema>;

export const metricQueryTableViz = (
    vizConfig: TableVizConfigSchemaType,
    filters: Filters,
    maxLimit: number,
): AiMetricQueryWithFilters => ({
    exploreName: vizConfig.exploreName,
    metrics: vizConfig.metrics,
    dimensions: vizConfig.dimensions || [],
    sorts: vizConfig.sorts,
    limit: getValidAiQueryLimit(vizConfig.limit, maxLimit),
    filters,
});
