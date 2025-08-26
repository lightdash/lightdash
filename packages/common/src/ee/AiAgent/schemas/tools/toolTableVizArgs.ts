import { z } from 'zod';
import { MetricType } from '../../../../types/field';
import { FollowUpTools } from '../../followUpTools';
import { AiResultType } from '../../types';
import { filtersSchema, filtersSchemaTransformed } from '../filters';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';
import { tableVizConfigSchema } from '../visualizations';

const customMetricBaseSchema = z.object({
    name: z
        .string()
        .describe(
            'Unique metric name using snake_case (e.g., "avg_customer_age", "total_revenue")',
        ),
    label: z
        .string()
        .describe(
            'Human-readable label for the metric (e.g., "Average Customer Age", "Total Revenue")',
        ),
    baseDimensionName: z
        .string()
        .describe(
            'Name of the base dimension/column this metric calculates from',
        ),
    table: z
        .string()
        .describe(
            'Table name where the base column exists. Match with available dimensions in the explore.',
        ),
    type: z
        .enum([
            MetricType.AVERAGE,
            MetricType.COUNT,
            MetricType.COUNT_DISTINCT,
            MetricType.MAX,
            MetricType.MIN,
            MetricType.SUM,
            MetricType.PERCENTILE,
            MetricType.MEDIAN,
        ])
        .describe(
            `Choose based on the user's request. If the base dimension type is STRING, TIMESTAMP, DATE, BOOLEAN, use COUNT_DISTINCT, COUNT, MIN, MAX. If the base dimension type is NUMBER, use MIN, MAX, SUM, PERCENTILE, MEDIAN, AVERAGE, COUNT_DISTINCT, COUNT. If the base dimension type is BOOLEAN, use COUNT_DISTINCT, COUNT.`,
        ),
});

export type CustomMetricBaseSchema = z.infer<typeof customMetricBaseSchema>;

const TOOL_TABLE_VIZ_DESCRIPTION = `Use this tool to query data to display in a table or summarized if limit is set to 1.`;

export const toolTableVizArgsSchema = createToolSchema(
    AiResultType.TABLE_RESULT,
    TOOL_TABLE_VIZ_DESCRIPTION,
)
    .extend({
        ...visualizationMetadataSchema.shape,
        customMetrics: z
            .array(customMetricBaseSchema)
            .nullable()
            .describe(
                `Create custom metrics when requested metrics don't exist. Only create if no existing metric matches the user's request. Use null if no custom metrics needed.
                
                IMPORTANT: If the user requests metrics that don't exist (like "average customer age"), create them using the customMetrics field. Analyze available dimensions from findFields results and create appropriate SQL aggregations.

                When using custom metrics:
                1. Create the metric in customMetrics array with just the metric name (e.g., "avg_customer_age")
                2. Reference it in metrics array using the format "table_metricname" (e.g., "customers_avg_customer_age")
                3. Reference it in sorts array using the format "table_metricname" (e.g., "customers_avg_customer_age")
                4. DO NOT use the raw metric name in metrics or sorts arrays

                For example:
                - "Show me average customer age sorted descending" → 
                customMetrics: [{name: "avg_customer_age", label: "Average Customer Age", type: "AVERAGE", baseDimensionName: "age", table: "customers"}]
                metrics: ["customers_avg_customer_age"]
                sorts: [{fieldId: "customers_avg_customer_age", descending: true}]`,
            ),
        vizConfig: tableVizConfigSchema,
        filters: filtersSchema
            .nullable()
            .describe(
                'Filters to apply to the query. Filtered fields must exist in the selected explore.',
            ),

        followUpTools: z
            .array(
                z.union([
                    z.literal(FollowUpTools.GENERATE_BAR_VIZ),
                    z.literal(FollowUpTools.GENERATE_TIME_SERIES_VIZ),
                ]),
            )
            .describe(
                'The actions the User can ask for after the AI has generated the table.',
            ),
    })
    .build();

export type ToolTableVizArgs = z.infer<typeof toolTableVizArgsSchema>;

export const toolTableVizArgsSchemaTransformed =
    toolTableVizArgsSchema.transform((data) => ({
        ...data,
        filters: filtersSchemaTransformed.parse(data.filters),
    }));

export type ToolTableVizArgsTransformed = z.infer<
    typeof toolTableVizArgsSchemaTransformed
>;
