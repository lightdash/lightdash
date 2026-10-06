import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';
import { toolChartAsCodeMetricQuerySchema } from './toolCreateContentArgs';

export const TOOL_RUN_CONTENT_QUERY_DESCRIPTION = `Run a chart-as-code metric query or saved chart content and return the rows it produces as CSV.

Use this to verify generated or edited chart content before presenting it as complete.

Input modes:
- metricQuery: run an unsaved chart-as-code metricQuery with a tableName.
- chart: run a saved chart by chartSlug.
- dashboardChart: run a saved chart by chartSlug in a dashboardSlug context, applying dashboard filters.`;

export const toolRunContentQueryArgsSchema = createToolSchema()
    .extend({
        source: z.discriminatedUnion('type', [
            z.object({
                type: z.literal('metricQuery'),
                tableName: z
                    .string()
                    .describe('The chart-as-code tableName/explore name.'),
                metricQuery: toolChartAsCodeMetricQuerySchema,
                parameters: z
                    .unknown()
                    .nullable()
                    .optional()
                    .describe('Optional chart parameter values, or null.'),
            }),
            z.object({
                type: z.literal('chart'),
                chartSlug: z.string().describe('Slug of the saved chart.'),
                limit: z.coerce
                    .number()
                    .nullable()
                    .describe('Optional row limit override.'),
            }),
            z.object({
                type: z.literal('dashboardChart'),
                chartSlug: z.string().describe('Slug of the saved chart.'),
                dashboardSlug: z
                    .string()
                    .describe('Slug of the dashboard containing the chart.'),
                limit: z.coerce
                    .number()
                    .nullable()
                    .describe('Optional row limit override.'),
            }),
        ]),
    })
    .build();

export type ToolRunContentQueryArgs = z.infer<
    typeof toolRunContentQueryArgsSchema
>;

const savedChartStructureSchema = z.object({
    chartUuid: z.string(),
    name: z.string(),
    exploreName: z.string(),
    dimensions: z.array(z.string()).describe('Dimension field ids.'),
    metrics: z.array(z.string()).describe('Metric field ids.'),
});

const savedChartSpecSchema = savedChartStructureSchema.extend({
    filters: z
        .record(z.string(), z.unknown())
        .describe(
            "The executed query's filters, with dashboard filters applied for dashboardChart, as printed in the header's Filters: line.",
        ),
    sorts: z.array(
        z.object({
            fieldId: z.string(),
            descending: z.boolean(),
            nullsFirst: z.boolean().optional(),
            pivotValues: z
                .array(
                    z.object({
                        reference: z.string(),
                        value: z.union([
                            z.string(),
                            z.number(),
                            z.boolean(),
                            z.null(),
                        ]),
                    }),
                )
                .optional(),
        }),
    ),
    limit: z
        .number()
        .describe(
            "The executed query's row limit after the source.limit override and clamping, as printed in the header's Limit: line.",
        ),
    tableCalculations: z.array(z.string()).describe('Table calculation names.'),
    customMetrics: z.array(z.string()).describe('Custom metric field ids.'),
    customDimensions: z
        .array(z.string())
        .describe('Custom dimension field ids.'),
});

export const toolRunContentQueryStructuredContentSchema = z.discriminatedUnion(
    'outcome',
    [
        z.object({
            outcome: z.literal('rows'),
            chart: savedChartSpecSchema
                .nullable()
                .describe(
                    'The saved chart that was run; null when an unsaved metricQuery was run.',
                ),
            rowCount: z
                .number()
                .int()
                .nonnegative()
                .describe('Total rows the query returned.'),
            shownRowCount: z
                .number()
                .int()
                .nonnegative()
                .describe(
                    'Rows included in `rows`; fewer than rowCount when the result was truncated to keep the conversation small.',
                ),
            columns: z
                .array(
                    z.object({
                        fieldId: z.string().nullable(),
                        label: z.string(),
                    }),
                )
                .describe(
                    'Ordered columns: `fieldId` keys saved chart rows and is null for an unsaved metricQuery; `label` is the CSV header shown to the model.',
                ),
            rows: z
                .union([
                    z.array(z.record(z.string(), z.unknown())),
                    z.array(z.array(z.unknown())),
                ])
                .describe(
                    'Raw typed values of the rows rendered in the CSV: keyed by field id for saved charts, or cell arrays in column order for an unsaved metricQuery.',
                ),
            review: z.string().nullable(),
            truncationNote: z.string().nullable(),
        }),
        z.object({
            outcome: z
                .literal('noResults')
                .describe('The query ran but returned no rows.'),
            review: z.string().nullable(),
        }),
        z.object({
            outcome: z
                .literal('dataAccessDisabled')
                .describe(
                    'Data access is disabled for this agent; no rows were fetched.',
                ),
            chart: savedChartStructureSchema
                .nullable()
                .describe(
                    'Structure of the saved chart; null when an unsaved metricQuery was validated instead.',
                ),
        }),
    ],
);

export type ToolRunContentQueryStructuredContent = z.infer<
    typeof toolRunContentQueryStructuredContentSchema
>;

export const toolRunContentQueryOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema.extend({
        queryUuid: z.string().uuid().optional(),
        queryCacheHit: z.boolean().optional(),
    }),
    structuredContent: toolRunContentQueryStructuredContentSchema,
});

export type ToolRunContentQueryOutput = z.infer<
    typeof toolRunContentQueryOutputSchema
>;
