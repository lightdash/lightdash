import { z } from 'zod';
import { type TableCalculation } from '../../../../types/field';
import type { Filters } from '../../../../types/filter';
import type { AiMetricQueryWithFilters } from '../../types';
import { getValidAiQueryLimit } from '../../validators';
import {
    customMetricsSchema,
    customMetricsSchemaTransformed,
    filterAggregationCustomMetrics,
    type TransformedCustomMetric,
} from '../customMetrics';
import { getFieldIdSchema } from '../fieldId';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import { baseOutputMetadataSchema } from '../outputMetadata';
import sortFieldSchema from '../sortField';
import { tableCalcsSchema } from '../tableCalcs/tableCalcs';
import { createToolSchema } from '../toolSchemaBuilder';

export const tableVizConfigSchema = z
    .object({
        exploreName: z
            .string()
            .describe(
                'The name of the explore containing the metrics and dimensions used for table query',
            ),
        metrics: z
            .array(getFieldIdSchema({ additionalDescription: null }))
            .describe(
                'The field ids of the metrics to be calculated for the table. They will be grouped by the dimensions.',
            ),
        dimensions: z
            .array(getFieldIdSchema({ additionalDescription: null }))
            .describe(
                'The field id for the dimensions to group the metrics by',
            ),
        sorts: z
            .array(sortFieldSchema)
            .describe(
                'Sort configuration for the query, it can use a combination of metrics and dimensions.',
            ),

        limit: z.coerce
            .number()
            .nullable()
            .describe('The maximum number of rows in the table.'),
    })
    .describe(
        'Configuration file for generating a table from a query with metrics and dimensions',
    );

export type TableVizConfigSchemaType = z.infer<typeof tableVizConfigSchema>;

export const metricQueryTableViz = ({
    vizConfig,
    filters,
    maxLimit,
    customMetrics,
    tableCalculations,
}: {
    vizConfig: TableVizConfigSchemaType;
    filters: Filters;
    maxLimit: number;
    customMetrics: TransformedCustomMetric[] | null;
    tableCalculations: TableCalculation[];
}): AiMetricQueryWithFilters => ({
    exploreName: vizConfig.exploreName,
    metrics: vizConfig.metrics,
    dimensions: vizConfig.dimensions || [],
    sorts: vizConfig.sorts.map((sort) => ({
        ...sort,
        nullsFirst: sort.nullsFirst ?? undefined,
    })),
    limit: getValidAiQueryLimit(vizConfig.limit, maxLimit),
    filters,
    additionalMetrics: filterAggregationCustomMetrics(customMetrics),
    customMetrics: customMetrics ?? null,
    tableCalculations,
});

export const TOOL_RUN_METRIC_QUERY_DESCRIPTION = `Tool: runMetricQuery

Purpose:
Run a metric query and get the results as CSV data. This is useful for data analysis and export.

Usage Tips:
- Specify the exploreName, dimensions, metrics, and any filters needed for your query
- Results are returned as CSV formatted text
- Use this when you need to analyze data or export query results
- The query respects the same limits and permissions as other visualization tools
`;

export const toolRunMetricQueryArgsSchema = createToolSchema()
    .extend({
        vizConfig: tableVizConfigSchema,
        customMetrics: customMetricsSchema,
        tableCalculations: tableCalcsSchema,
        filters: filtersSchemaV2
            .nullable()
            .describe(
                'Filters to apply to the query. Filtered fields must exist in the selected explore or should be referenced from the custom metrics.',
            ),
    })
    .build();

export const toolRunMetricQueryArgsSchemaTransformed =
    toolRunMetricQueryArgsSchema.transform((data) => ({
        ...data,
        customMetrics: customMetricsSchemaTransformed.parse(
            data.customMetrics ?? [],
        ),
        filters: filtersSchemaTransformed.parse(data.filters ?? null),
    }));

export const toolRunMetricQueryOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolRunMetricQueryArgs = z.infer<
    typeof toolRunMetricQueryArgsSchema
>;
export type ToolRunMetricQueryArgsTransformed = z.infer<
    typeof toolRunMetricQueryArgsSchemaTransformed
>;
export type ToolRunMetricQueryOutput = z.infer<
    typeof toolRunMetricQueryOutputSchema
>;
