import { z } from 'zod';
import { isHexCodeColor } from '../../utils/colors';
import { getFieldIdSchema } from './fieldIdSchema';

export const dataAppVizGradientValueSchema = z.object({
    colors: z
        .array(
            z
                .string()
                .refine(
                    isHexCodeColor,
                    'Expected a 3, 6, or 8-digit hex color',
                ),
        )
        .min(2)
        .max(5),
    min: z.union([z.number().finite(), z.literal('auto')]),
    max: z.union([z.number().finite(), z.literal('auto')]),
});

// Chart-specific configuration for rendering hints
const chartConfigBuiltinSchema = z.object({
    defaultVizType: z
        .enum([
            'table',
            'bar',
            'horizontal',
            'line',
            'scatter',
            'pie',
            'funnel',
        ])
        .describe('The default visualization type to render'),

    // Axis field selection
    xAxisDimension: z
        .string()
        .nullable()
        .describe(
            'The dimension field ID to use for the x-axis. Must be included in queryConfig.dimensions',
        ),
    yAxisMetrics: z
        .array(getFieldIdSchema({ additionalDescription: null }))
        .nullable()
        .describe(
            'The metric field IDs to display on the y-axis. Must be included in queryConfig.metrics or come from tableCalculations',
        ),

    // Series creation control
    groupBy: z
        .array(getFieldIdSchema({ additionalDescription: null }))
        .nullable()
        .describe(
            'Dimensions that split metrics into separate series (one line per region, one bar per status), never the x-axis dimension. Example: dimensions=["order_date", "status"], groupBy=["status"] creates one series per status value. null for a single-series chart.',
        ),

    // Bar and horizontal bar chart specific
    xAxisType: z
        .enum(['category', 'time'])
        .nullable()
        .describe(
            'The x-axis type can be categorical for string value or time if the dimension is a date or timestamp. Applies to bar, horizontal, and scatter charts.',
        ),
    stackBars: z
        .boolean()
        .nullable()
        .describe(
            'If groupBy is provided then this will stack the bars on top of each other instead of side by side. Applies to bar and horizontal charts.',
        ),

    // Line chart specific
    lineType: z
        .enum(['line', 'area'])
        .nullable()
        .describe(
            'default line. The type of line to display. If area then the area under the line will be filled in.',
        ),

    // Common display properties
    xAxisLabel: z.string().describe('A helpful label to explain the x-axis'),
    yAxisLabel: z.string().describe('A helpful label to explain the y-axis'),
    secondaryYAxisMetric: z
        .string()
        .nullish()
        .default(null)
        .describe(
            '(Optional) A single metric field ID to display on a secondary (right) y-axis. Must NOT be included in yAxisMetrics. Use when one metric has a very different scale than others (e.g., percentage vs count).',
        ),
    secondaryYAxisLabel: z
        .string()
        .nullish()
        .default(null)
        .describe('A helpful label for the secondary y-axis'),
});

export const customChartTypeOptionValueSchema = z.union([
    dataAppVizGradientValueSchema,
    z.string(),
    z.number(),
    z.boolean(),
]);

// Custom chart type branch of chartConfig — LLM-authored. Discriminated
// structurally from the builtin branch by customChartTypeSlug.
const chartConfigCustomChartTypeSchema = z.object({
    customChartTypeSlug: z
        .string()
        .describe(
            'Slug of the custom chart type to render this answer through, as returned by the custom chart type discovery tools.',
        ),
    fieldMapping: z
        .record(
            z.string(),
            z.union([
                getFieldIdSchema({ additionalDescription: null }),
                z
                    .array(getFieldIdSchema({ additionalDescription: null }))
                    .refine(
                        (ids) => new Set(ids).size === ids.length,
                        'field ids must be unique',
                    ),
            ]),
        )
        .describe(
            "Binds each custom chart type slot to this query's fields: a field id for a single slot, or ordered unique field ids for a slot declared multiple. Every required slot must be bound.",
        ),
    options: z
        .record(z.string(), customChartTypeOptionValueSchema)
        .nullish()
        .default(null)
        .describe(
            "Values for the type's config options, keyed by option name from the type's schema. null to use the type's defaults.",
        ),
});

// The only chartConfig union — advertised to the model and used to parse
// persisted tool args alike: builtin viz config | custom chart type slug.
// Server-derived custom chart type data (dataAppVizUuid) never lives inside
// chartConfig; it sits beside the verbatim tool args in the artifact envelope.
export const chartConfigSchema = z
    .union([chartConfigBuiltinSchema, chartConfigCustomChartTypeSchema])
    .nullable();

// Builtin-only view pinning surfaces that do not support custom chart types
// (MCP run_metric_query, the dashboard tool): their contracts
// stay byte-identical to before the union existed.
export const chartConfigBuiltinOnlySchema = chartConfigBuiltinSchema.nullable();

export type ToolRunQueryBuiltinChartConfig = z.infer<
    typeof chartConfigBuiltinSchema
>;
export type ToolRunQueryCustomChartTypeConfig = z.infer<
    typeof chartConfigCustomChartTypeSchema
>;
export type ToolRunQueryChartConfig = z.infer<typeof chartConfigSchema>;

export const isCustomChartTypeSlugChartConfig = (
    chartConfig: ToolRunQueryChartConfig | undefined,
): chartConfig is ToolRunQueryCustomChartTypeConfig =>
    !!chartConfig && 'customChartTypeSlug' in chartConfig;
