import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { defineTool, type ToolInput, type ToolOutput } from './toolDefinition';

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

const toolRunSavedChartOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const runSavedChartTool = defineTool({
    canonicalName: 'runSavedChart',
    title: 'Run Saved Chart',
    contexts: ['agent'] as const,
    description: {
        agent: TOOL_RUN_SAVED_CHART_DESCRIPTION,
    },
    buildInputSchemas: {
        agent: ({ createSchema }) =>
            createSchema()
                .extend({
                    chartUuid: z
                        .string()
                        .describe(
                            'UUID of the saved chart to execute. Use the chartUuid from the prompt context or from a prior findContent / findCharts result.',
                        ),
                })
                .build(),
    },
    outputSchema: toolRunSavedChartOutputSchema,
});

export type ToolRunSavedChartArgs = ToolInput<
    typeof runSavedChartTool,
    'agent'
>;
export type ToolRunSavedChartOutput = ToolOutput<typeof runSavedChartTool>;
