import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { MetricType } from '../../../types/field';
import { type MetricFilterRule } from '../../../types/filter';
import { type AdditionalMetric } from '../../../types/metricQuery';
import {
    booleanFilterSchema,
    dateFilterSchema,
    numberFilterSchema,
    stringFilterSchema,
} from './filters';

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

// Convert fieldId (customers_age) to fieldRef (customers.age)
const fieldIdToFieldRef = (fieldId: string, table: string): string => {
    const prefix = `${table}_`;
    if (fieldId.startsWith(prefix)) {
        return `${table}.${fieldId.slice(prefix.length)}`;
    }
    return `${table}.${fieldId}`;
};

const filterSchema = z.union([
    booleanFilterSchema,
    stringFilterSchema,
    numberFilterSchema,
    dateFilterSchema,
]);

const metricFilterRuleSchema = z.object({
    filter: filterSchema,
    table: z.string().describe('Table name this filter field belongs to'),
});

const metricFiltersSchema = z.array(metricFilterRuleSchema).nullable();

const customMetricBaseSchemaV1 = z.object({
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
});

export const customMetricBaseSchemaV2 = customMetricBaseSchemaV1.extend({
    filters: metricFiltersSchema.describe(
        'Optional filters for conditional metrics. Each filter needs fieldId (from findFields) and table name.',
    ),
});

export const customMetricBaseSchema = z.union([
    customMetricBaseSchemaV2,
    customMetricBaseSchemaV1,
]);

// Type after first transform (baseDimensionName extracted, filters still in AI format)
export type CustomMetricBase = z.infer<typeof customMetricBaseSchema>;

export const customMetricBaseSchemaTransformed = customMetricBaseSchemaV2
    .extend({
        filters: metricFiltersSchema.default(null),
    })
    .transform(
        (cm): Omit<AdditionalMetric, 'sql'> => ({
            ...cm,
            baseDimensionName: extractFieldNameFromFieldId(
                cm.table,
                cm.baseDimensionName,
            ),
            filters: cm.filters?.length
                ? cm.filters.map(
                      (f): MetricFilterRule => ({
                          id: uuid(),
                          target: {
                              fieldRef: fieldIdToFieldRef(
                                  f.filter.fieldId,
                                  f.table,
                              ),
                          },
                          operator: f.filter.operator,
                          values: 'values' in f.filter ? f.filter.values : [],
                          ...('settings' in f.filter
                              ? { settings: f.filter.settings }
                              : {}),
                      }),
                  )
                : undefined,
        }),
    );

export type CustomMetricBaseTransformed = z.infer<
    typeof customMetricBaseSchemaTransformed
>;

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

To create conditional metrics (e.g., "count of orders where status = 'completed'"):
1. Set the appropriate aggregation type (COUNT, SUM, etc.)
2. Add filters array with {filter, table} objects
3. filter contains: fieldId, fieldType, fieldFilterType, operator, values
4. Example: {name: "completed_orders", type: "COUNT", baseDimensionName: "order_id", table: "orders",
   filters: [{table: "orders", filter: {fieldId: "orders_status", fieldType: "STRING", fieldFilterType: "string",
   operator: "equals", values: ["completed"]}}]}

For example:
- "Show me average customer age sorted descending" →
customMetrics: [{name: "avg_customer_age", label: "Average Customer Age", type: "AVERAGE", baseDimensionName: "age", table: "customers"}]
metrics: ["customers_avg_customer_age"]
sorts: [{fieldId: "customers_avg_customer_age", descending: true}]`,
    );

export const customMetricsSchemaTransformed = z
    .array(customMetricBaseSchemaTransformed)
    .nullable();
