import { z } from 'zod';
import { MetricType } from '../../../types/field';

const extractFieldNameFromFieldId = (
    table: string,
    baseDimensionName: string,
): string => {
    const prefix = `${table}_`;
    if (!baseDimensionName.startsWith(prefix)) {
        return baseDimensionName;
    }
    return baseDimensionName.slice(prefix.length);
};

export const customMetricBaseSchema = z
    .object({
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
        description: z
            .string()
            .describe(
                'Brief explanation of what the metric represents, how it is calculated, and why it matters. Example: "Calculates the total revenue by summing all transaction amounts in the sales table."',
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
    })
    .transform((data) => ({
        ...data,
        baseDimensionName: extractFieldNameFromFieldId(
            data.table,
            data.baseDimensionName,
        ),
    }));

export type CustomMetricBase = z.infer<typeof customMetricBaseSchema>;

export const customMetricsSchema = z
    .array(customMetricBaseSchema)
    .nullable()
    .describe(
        `Create custom metrics when requested metrics don't exist. Only create if no existing metric matches the user's request. Use null if no custom metrics needed.

IMPORTANT: If the user requests metrics that don't exist (like "average customer age"), create them using the customMetrics field. Analyze available dimensions from findFields results and create appropriate SQL aggregations.

When using custom metrics:
1. Create the metric in customMetrics array with just the metric name (e.g., "avg_customer_age")
2. Reference it in metrics array using the format "table_metricname" (e.g., "customers_avg_customer_age")
3. Reference it anywhere else you use fieldIds (sorts, filters, chartConfig.yAxisMetrics) using the same "table_metricname" format
4. DO NOT use the raw metric name in metrics, sorts, filters, or chart configuration

For example:
- "Show me average customer age sorted descending" →
customMetrics: [{name: "avg_customer_age", label: "Average Customer Age", type: "AVERAGE", baseDimensionName: "age", table: "customers"}]
metrics: ["customers_avg_customer_age"]
sorts: [{fieldId: "customers_avg_customer_age", descending: true}]`,
    );
