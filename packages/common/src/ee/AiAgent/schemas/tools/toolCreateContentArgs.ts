import { z } from 'zod';
import type { ChartAsCode } from '../../../../types/coder';

export const TOOL_CREATE_CONTENT_DESCRIPTION =
    'Create a new dashboard or chart, consult the skills for the required fields. Returns the created content with the final persisted slug.';

type RequiredMetricQueryKeys = keyof Omit<
    ChartAsCode['metricQuery'],
    | 'additionalMetrics'
    | 'customDimensions'
    | 'metricOverrides'
    | 'dimensionOverrides'
    | 'timezone'
    | 'pivotDimensions'
    | 'metadata'
>;

const TOOL_CHART_AS_CODE_METRIC_QUERY_DESCRIPTION =
    'Chart-as-code metricQuery object. Required fields: exploreName, dimensions, metrics, filters, sorts, limit, tableCalculations. Optional passthrough fields: additionalMetrics, customDimensions, metricOverrides, dimensionOverrides, timezone, pivotDimensions, metadata. Every dimension in dimensions must appear in exactly one of: layout.xField, layout.yField, or pivotConfig.columns.';

const chartAsCodeMetricQueryShape = {
    exploreName: z.unknown().optional(),
    dimensions: z.array(z.unknown()),
    metrics: z.array(z.unknown()),
    filters: z.unknown().optional(),
    sorts: z.array(z.unknown()),
    limit: z.unknown().optional(),
    tableCalculations: z.array(z.unknown()),
} satisfies Record<RequiredMetricQueryKeys, z.ZodType>;

export const toolChartAsCodeMetricQuerySchema = z
    .object(chartAsCodeMetricQueryShape)
    // Strict OpenAI schemas cannot use optional fields; passthrough preserves optional chart-as-code fields when present.
    .passthrough()
    .describe(TOOL_CHART_AS_CODE_METRIC_QUERY_DESCRIPTION);

const baseContentSchema = z.object({
    slug: z
        .string()
        .min(1)
        .describe(
            'Requested slug. Lightdash may append a suffix if this slug already exists.',
        ),
    name: z.string().min(1),
    description: z.string().nullable(),
    spaceSlug: z.string().min(1),
    version: z.coerce.number(),
    contentType: z.string(),
    updatedAt: z.unknown().optional(),
    downloadedAt: z.unknown().optional(),
    verified: z.boolean(),
    verification: z.unknown().optional(),
});

export const toolCreateContentArgsSchema = z.object({
    type: z
        .enum(['dashboard', 'chart'])
        .describe('Type of Lightdash content to create.'),
    content: z.union([
        baseContentSchema
            .extend({
                tiles: z.array(z.unknown()),
                tabs: z.array(z.unknown()),
                config: z.unknown().optional(),
                filters: z.unknown().optional(),
                parameters: z.unknown().optional(),
            })
            .passthrough()
            .describe('Full Dashboard JSON to create.'),
        baseContentSchema
            .extend({
                tableName: z.string().min(1),
                metricQuery: toolChartAsCodeMetricQuerySchema,
                chartConfig: z.unknown().optional(),
                pivotConfig: z.unknown().optional(),
                tableConfig: z.unknown().optional(),
                dashboardSlug: z.string(),
                parameters: z.unknown().optional(),
            })
            .passthrough()
            .describe('Full Chart JSON to create.'),
    ]),
});

export type ToolCreateContentArgs = z.infer<typeof toolCreateContentArgsSchema>;

const toolCreateContentMetadataSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('error') }),
    z.object({
        status: z.literal('success'),
        slug: z.string(),
        name: z.string(),
        uuid: z.string(),
        href: z.string(),
        warnings: z.array(z.string()),
    }),
]);

export const toolCreateContentOutputSchema = z.object({
    result: z.string(),
    metadata: toolCreateContentMetadataSchema,
});

export type ToolCreateContentOutput = z.infer<
    typeof toolCreateContentOutputSchema
>;
