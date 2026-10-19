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
- chart: run a saved chart by chartSlug. Set chartType "sql_chart" for a saved SQL chart; it runs without SQL approval.
- dashboardChart: run a saved chart by chartSlug in a dashboardSlug context, applying dashboard filters. chartType works the same.
- sql: run a raw SELECT to check a SQL chart's sql before saving it. The user approves the SQL first; saving the same SQL in a SQL chart in this response needs no second approval.`;

// Slugs are unique per chart type, so the type picks which chart a slug names.
const savedChartTypeSchema = () =>
    z
        .enum(['chart', 'sql_chart'])
        .nullable()
        .describe(
            'Content type of the saved chart, as in readContent: "chart" (explore chart) or "sql_chart". Null means "chart".',
        );

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
                chartType: savedChartTypeSchema(),
                chartSlug: z.string().describe('Slug of the saved chart.'),
                limit: z.coerce
                    .number()
                    .nullable()
                    .describe('Optional row limit override.'),
            }),
            z.object({
                type: z.literal('dashboardChart'),
                chartType: savedChartTypeSchema(),
                chartSlug: z.string().describe('Slug of the saved chart.'),
                dashboardSlug: z
                    .string()
                    .describe('Slug of the dashboard containing the chart.'),
                limit: z.coerce
                    .number()
                    .nullable()
                    .describe('Optional row limit override.'),
            }),
            z.object({
                type: z.literal('sql'),
                sql: z
                    .string()
                    .describe(
                        'A single SELECT (or WITH ... SELECT) statement in the warehouse SQL dialect.',
                    ),
                limit: z.coerce
                    .number()
                    .nullable()
                    .describe('Optional row limit, or null for the default.'),
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

const savedSqlChartSchema = () =>
    z
        .object({
            chartUuid: z.string(),
            slug: z.string(),
            name: z.string(),
            sql: z.string(),
        })
        .nullable()
        .describe('The saved SQL chart that was run; null for other sources.');

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
                    'The saved explore chart that was run; null for an unsaved metricQuery, SQL or a saved SQL chart.',
                ),
            sqlChart: savedSqlChartSchema(),
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
                    'Ordered columns: `fieldId` keys saved explore chart rows and is null otherwise; `label` is the CSV header shown to the model.',
                ),
            rows: z
                .union([
                    z.array(z.record(z.string(), z.unknown())),
                    z.array(z.array(z.unknown())),
                ])
                .describe(
                    'Raw typed values of the rows rendered in the CSV: keyed by field id for saved explore charts, or cell arrays in column order otherwise.',
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
                    'Structure of the saved explore chart; null for other sources.',
                ),
            sqlChart: savedSqlChartSchema(),
        }),
    ],
);

export type ToolRunContentQueryStructuredContent = z.infer<
    typeof toolRunContentQueryStructuredContentSchema
>;

export const toolRunContentQueryOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema.extend({
        queryCacheHit: z.boolean().optional(),
    }),
    structuredContent: toolRunContentQueryStructuredContentSchema,
});

export type ToolRunContentQueryOutput = z.infer<
    typeof toolRunContentQueryOutputSchema
>;
