import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

export const TOOL_RUN_SAVED_CHART_DESCRIPTION = `
Run an existing saved chart by its UUID and return the rows it produces.

When to use this tool:
- The user has pinned a chart (you'll see it listed in the prompt context as
  "Chart \\"...\\" (chartUuid: ...)") and you need to inspect its data to answer
  their question.
- You discovered a relevant chart via findContent / findCharts and want to read
  its results without rebuilding the query from scratch.

Prefer this over generateVisualization when a saved chart already exists for the data the
user is asking about. The chart's saved metric query, filters, sorts, and
custom metrics are applied automatically.
`;

export const toolRunSavedChartArgsSchema = createToolSchema()
    .extend({
        chartUuid: z
            .string()
            .describe(
                'UUID of the saved chart to execute. Use the chartUuid from the prompt context or from a prior findContent / findCharts result.',
            ),
    })
    .build();

export type ToolRunSavedChartArgs = z.infer<typeof toolRunSavedChartArgsSchema>;

const savedChartStructureSchema = z.object({
    chartUuid: z.string(),
    name: z.string(),
    exploreName: z.string(),
    dimensions: z.array(z.string()).describe('Dimension field ids'),
    metrics: z.array(z.string()).describe('Metric field ids'),
});

export type SavedChartStructure = z.infer<typeof savedChartStructureSchema>;

const savedChartSpecSchema = savedChartStructureSchema.extend({
    filters: z
        .record(z.string(), z.unknown())
        .describe(
            'The saved Filters object: dimensions / metrics / tableCalculations filter groups',
        ),
    sorts: z.array(
        z.object({
            fieldId: z.string(),
            descending: z.boolean(),
            nullsFirst: z.boolean().optional(),
        }),
    ),
    limit: z.number().describe('Row limit saved on the chart'),
    tableCalculations: z
        .array(z.string())
        .describe('Names of the table calculations saved on the chart'),
    customMetrics: z
        .array(z.string())
        .describe('Field ids of the custom metrics saved on the chart'),
    customDimensions: z
        .array(z.string())
        .describe('Ids of the custom dimensions saved on the chart'),
});

export type SavedChartSpec = z.infer<typeof savedChartSpecSchema>;

export const toolRunSavedChartStructuredContentSchema = z.discriminatedUnion(
    'status',
    [
        z.object({
            status: z.literal('results'),
            chart: savedChartSpecSchema,
            rowCount: z.number().describe('Rows the query returned in total'),
            shownRowCount: z
                .number()
                .describe(
                    'Rows included in `rows`; lower than rowCount when the result was truncated to keep the conversation small',
                ),
            truncated: z
                .boolean()
                .describe(
                    'Whether `rows` holds only the first shownRowCount rows',
                ),
            columns: z.array(
                z.object({
                    fieldId: z.string(),
                    label: z
                        .string()
                        .describe('Column header shown in the CSV'),
                }),
            ),
            rows: z
                .array(z.record(z.string(), z.unknown()))
                .describe('Row cells keyed by column fieldId'),
        }),
        z.object({
            status: z.literal('no_results'),
            note: z
                .string()
                .describe('Retry guidance; the same text as `result`'),
        }),
        z.object({
            status: z.literal('data_access_disabled'),
            chart: savedChartStructureSchema,
            note: z
                .string()
                .describe(
                    'Why no rows are returned; the same text as `result`',
                ),
        }),
    ],
);

export type ToolRunSavedChartStructuredContent = z.infer<
    typeof toolRunSavedChartStructuredContentSchema
>;

export const toolRunSavedChartOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolRunSavedChartStructuredContentSchema,
});

export type ToolRunSavedChartOutput = z.infer<
    typeof toolRunSavedChartOutputSchema
>;
