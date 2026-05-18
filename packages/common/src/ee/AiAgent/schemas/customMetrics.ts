import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { MetricType } from '../../../types/field';
import { type MetricFilterRule } from '../../../types/filter';
import { type AdditionalMetric } from '../../../types/metricQuery';
import { validPeriodOverPeriodGranularities } from '../../../types/periodOverPeriodComparison';
import { type TimeFrames } from '../../../types/timeFrames';
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

// --------------------------------------------------------------------------
// Aggregation custom metric — defines a NEW metric by applying an aggregation
// (SUM / AVG / COUNT / …) to a base dimension.
// --------------------------------------------------------------------------
const aggregationCustomMetricSchema = z.object({
    kind: z
        .literal('aggregation')
        .describe(
            'Custom metric defined by applying an aggregation to a base dimension. Use when the requested metric does not yet exist in the explore (e.g. "average customer age", "count of completed orders").',
        ),
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
            'Brief explanation of what the metric represents, how it is calculated, and why it matters.',
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
            `Aggregation type. If the base dimension type is STRING, TIMESTAMP, DATE, BOOLEAN, use COUNT_DISTINCT, COUNT, MIN, MAX. If NUMBER, use MIN, MAX, SUM, PERCENTILE, MEDIAN, AVERAGE, COUNT_DISTINCT, COUNT. If BOOLEAN, use COUNT_DISTINCT, COUNT.`,
        ),
    filters: metricFiltersSchema.describe(
        'Optional filters for conditional metrics. Each filter needs fieldId (from findFields) and table name.',
    ),
});

// --------------------------------------------------------------------------
// Period-over-period custom metric — defines a column that is an existing
// metric shifted back in time. The server builds the SQL from the base
// metric automatically; the LLM only declares what to shift, where to
// anchor it, and how far back to look.
// --------------------------------------------------------------------------
const popGranularityEnum = z.enum(
    validPeriodOverPeriodGranularities as [TimeFrames, ...TimeFrames[]],
);

const periodComparisonCustomMetricSchema = z.object({
    kind: z
        .literal('periodComparison')
        .describe(
            'Custom metric that compares a base metric against itself shifted back in time. Use for "month-over-month", "year-over-year", "vs last quarter", "compared to N periods ago".',
        ),
    baseMetricId: z
        .string()
        .describe(
            'Field ID of the metric to shift. Must appear in queryConfig.metrics OR be an aggregation custom metric defined in this same customMetrics array. Format: "table_metric_name".',
        ),
    timeDimensionId: z
        .string()
        .describe(
            'Field ID of the time dimension to anchor the shift on. Must be present in queryConfig.dimensions. Format: "table_column_granularity" — the suffix encodes the bucket (e.g. "..._month" → MONTH bucket).',
        ),
    granularity: popGranularityEnum.describe(
        "Bucket unit for the offset. Must equal the bucket encoded in timeDimensionId's suffix.",
    ),
    periodOffset: z
        .number()
        .int()
        .min(1)
        .describe(
            'Number of bucket units (granularity) to look back. >= 1. For year-over-year on monthly buckets: granularity=MONTH, periodOffset=12.',
        ),
});

// --------------------------------------------------------------------------
// Public schema — discriminated union the LLM sees.
// --------------------------------------------------------------------------
export const customMetricBaseSchema = z.discriminatedUnion('kind', [
    aggregationCustomMetricSchema,
    periodComparisonCustomMetricSchema,
]);

export type CustomMetricBase = z.infer<typeof customMetricBaseSchema>;
export type AggregationCustomMetric = z.infer<
    typeof aggregationCustomMetricSchema
>;
export type PeriodComparisonCustomMetric = z.infer<
    typeof periodComparisonCustomMetricSchema
>;

const aggregationTransformed = aggregationCustomMetricSchema
    .extend({
        filters: metricFiltersSchema.default(null),
    })
    .transform(
        (cm): Omit<AdditionalMetric, 'sql'> => ({
            table: cm.table,
            name: cm.name,
            label: cm.label,
            description: cm.description,
            baseDimensionName: extractFieldNameFromFieldId(
                cm.table,
                cm.baseDimensionName,
            ),
            type: cm.type,
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

// Kept for compatibility with existing imports — same shape as before.
export const customMetricBaseSchemaTransformed = aggregationTransformed;
export type CustomMetricBaseTransformed = z.infer<
    typeof customMetricBaseSchemaTransformed
>;

export type TransformedCustomMetric =
    | CustomMetricBaseTransformed
    | PeriodComparisonCustomMetric;

export const customMetricsSchemaTransformed = z
    .array(customMetricBaseSchema)
    .nullable()
    .transform((entries): TransformedCustomMetric[] | null => {
        if (!entries) return null;
        const transformed: TransformedCustomMetric[] = entries.map((entry) => {
            if (entry.kind === 'aggregation') {
                return aggregationTransformed.parse(entry);
            }
            return entry;
        });
        return transformed.length > 0 ? transformed : null;
    });

export const isPeriodComparisonCustomMetric = (
    cm: TransformedCustomMetric,
): cm is PeriodComparisonCustomMetric =>
    'kind' in cm && cm.kind === 'periodComparison';

export const filterAggregationCustomMetrics = (
    cms: TransformedCustomMetric[] | null | undefined,
): CustomMetricBaseTransformed[] =>
    (cms ?? []).filter(
        (cm): cm is CustomMetricBaseTransformed =>
            !isPeriodComparisonCustomMetric(cm),
    );

export const customMetricsSchema = z
    .array(customMetricBaseSchema)
    .nullable()
    .describe(
        `Define new metric columns the explore doesn't already have. Two kinds:

(1) kind: "aggregation" — a NEW metric built by aggregating a base dimension
    (SUM, AVG, COUNT, COUNT_DISTINCT, MIN, MAX, PERCENTILE, MEDIAN).
    Use when the requested metric doesn't exist in the explore.

(2) kind: "periodComparison" — a column that is an EXISTING metric shifted
    back in time. Use whenever the user asks for "year-over-year",
    "month-over-month", "vs last quarter", "compare to previous period",
    "N periods ago".

For period comparisons, every successful chart has three things:
- The time dimension in queryConfig.dimensions
- The base metric in queryConfig.metrics
- A customMetric of kind "periodComparison" pointing at that base metric and time dimension

The server generates the comparison column automatically and appends it next to the base metric. Do NOT add the comparison column id to queryConfig.metrics yourself.

DO NOT simulate a period comparison by adding a second time-dimension granularity (e.g. _year) and using groupBy. groupBy is for categorical splits (region, product). Time comparisons use a kind: "periodComparison" customMetric.

For aggregation entries:
1. Add the entry to customMetrics with kind: "aggregation"
2. Reference it in queryConfig.metrics using the format "table_name" (e.g. "customers_avg_customer_age")
3. Reference it the same way in sorts, filters, chartConfig.yAxisMetrics

Example A — "Average customer age sorted descending"
  customMetrics: [{ kind: "aggregation", name: "avg_customer_age", label: "Average Customer Age", description: "...", type: "AVERAGE", baseDimensionName: "age", table: "customers", filters: null }]
  queryConfig.metrics: ["customers_avg_customer_age"]
  sorts: [{ fieldId: "customers_avg_customer_age", descending: true }]

Example B — "Revenue by month with year-over-year comparison"
  queryConfig.dimensions: ["orders_order_date_month"]
  queryConfig.metrics: ["orders_revenue"]
  customMetrics: [{ kind: "periodComparison", baseMetricId: "orders_revenue", timeDimensionId: "orders_order_date_month", granularity: "MONTH", periodOffset: 12 }]`,
    );
