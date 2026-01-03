import { z } from 'zod';
import { customMetricsSchema } from '../customMetrics';
import { filtersSchemaTransformed, filtersSchemaV2 } from '../filters';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { tableCalcsSchema } from '../tableCalcs/tableCalcs';
import { createToolSchema } from '../toolSchemaBuilder';
import { tableVizConfigSchema } from '../visualizations';

export const TOOL_COMPILE_QUERY_DESCRIPTION = `Tool: compileQuery

Purpose:
Compile a Lightdash metric query into its raw SQL representation without executing it.
This is useful for debugging, verification, or explaining the query logic.

Usage Tips:
- Specify the exploreName, dimensions, metrics, and any filters needed for your query
- The output is the raw SQL that would be executed against the warehouse
- Use this when you want to see the SQL before running a query
`;

export const toolCompileQueryArgsSchema = createToolSchema({
    description: TOOL_COMPILE_QUERY_DESCRIPTION,
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

export const toolCompileQueryArgsSchemaTransformed =
    toolCompileQueryArgsSchema.transform((data) => ({
        ...data,
        customMetrics: customMetricsSchema.parse(data.customMetrics ?? []),
        filters: filtersSchemaTransformed.parse(data.filters ?? null),
    }));

export const toolCompileQueryOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolCompileQueryArgs = z.infer<typeof toolCompileQueryArgsSchema>;
export type ToolCompileQueryArgsTransformed = z.infer<
    typeof toolCompileQueryArgsSchemaTransformed
>;
export type ToolCompileQueryOutput = z.infer<
    typeof toolCompileQueryOutputSchema
>;
