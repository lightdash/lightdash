import { type z } from 'zod';
import { filtersSchema, filtersSchemaTransformed } from '../filters';
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

export const toolRunMetricQueryArgsSchema = createToolSchema(
    'run_metric_query',
    TOOL_RUN_METRIC_QUERY_DESCRIPTION,
)
    .extend({
        vizConfig: tableVizConfigSchema,
        filters: filtersSchema
            // This is an MCP only tool
            // Using optional instead of nullable here, works better with MCP clients
            .optional()
            .describe(
                'Filters to apply to the query. Filtered fields must exist in the selected explore.',
            ),
    })
    .build();

export type ToolRunMetricQueryArgs = z.infer<
    typeof toolRunMetricQueryArgsSchema
>;

export const toolRunMetricQueryArgsSchemaTransformed =
    toolRunMetricQueryArgsSchema.transform((data) => ({
        ...data,
        filters: filtersSchemaTransformed.parse(data.filters ?? null),
    }));

export type ToolRunMetricQueryArgsTransformed = z.infer<
    typeof toolRunMetricQueryArgsSchemaTransformed
>;
