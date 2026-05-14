import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const TOOL_RUN_SAVED_CHART_DESCRIPTION = `
Run an existing saved chart by its UUID and return the rows it produces.

When to use this tool:
- The user has pinned a chart (you'll see it listed in the prompt context as
  "Chart \\"...\\" (chartUuid: ...)") and you need to inspect its data to answer
  their question.
- You discovered a relevant chart via findContent / findCharts and want to read
  its results without rebuilding the query from scratch.

Prefer this over runQuery when a saved chart already exists for the data the
user is asking about. The chart's saved metric query, filters, sorts, and
custom metrics are applied automatically.
`;

export const toolRunSavedChartArgsSchema = createToolSchema({
    description: TOOL_RUN_SAVED_CHART_DESCRIPTION,
})
    .extend({
        chartUuid: z
            .string()
            .describe(
                'UUID of the saved chart to execute. Use the chartUuid from the prompt context or from a prior findContent / findCharts result.',
            ),
    })
    .build();

export type ToolRunSavedChartArgs = z.infer<typeof toolRunSavedChartArgsSchema>;

export const toolRunSavedChartOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolRunSavedChartOutput = z.infer<
    typeof toolRunSavedChartOutputSchema
>;
