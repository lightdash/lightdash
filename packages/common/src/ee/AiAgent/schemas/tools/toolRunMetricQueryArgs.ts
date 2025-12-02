import { z } from 'zod';
import { customMetricsSchema } from '../customMetrics';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { tableCalcsSchema } from '../tableCalcs/tableCalcs';
import { createToolSchema } from '../toolSchemaBuilder';
import { tableVizConfigSchema } from '../visualizations';

export const TOOL_RUN_METRIC_QUERY_DESCRIPTION = `Tool: runMetricQuery

Purpose:
Run a metric query and get the results as CSV data. This is useful for data analysis and export.

Usage Tips:
- Specify the exploreName, dimensions, metrics, and any filters needed for your query
- Results are returned as CSV formatted text
- Use this when you need to analyze data or export query results
- The query respects the same limits and permissions as other visualization tools
`;

export const toolRunMetricQueryArgsSchema = createToolSchema({
    description: TOOL_RUN_METRIC_QUERY_DESCRIPTION,
})
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
        customMetrics: customMetricsSchema.parse(data.customMetrics ?? []),
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
