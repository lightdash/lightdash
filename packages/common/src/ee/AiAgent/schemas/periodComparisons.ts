import { z } from 'zod';
import { validPeriodOverPeriodGranularities } from '../../../types/periodOverPeriodComparison';
import { type TimeFrames } from '../../../types/timeFrames';

const popGranularityEnum = z.enum(
    validPeriodOverPeriodGranularities as [TimeFrames, ...TimeFrames[]],
);

const periodComparisonSchema = z.object({
    baseMetricId: z
        .string()
        .describe(
            'Field ID of the metric to compare against itself. Must be either a real metric in queryConfig.metrics (e.g. "orders_revenue") or a custom metric defined in this query via customMetrics (e.g. "orders_avg_order_value"). Format: "table_metric_name".',
        ),
    timeDimensionId: z
        .string()
        .describe(
            'Field ID of the time dimension to anchor the comparison on. MUST be present in queryConfig.dimensions. Format: "table_column_granularity" (e.g. "orders_created_at_month"). The dimension\'s granularity should match or be finer than the granularity field.',
        ),
    granularity: popGranularityEnum.describe(
        'Time period to shift by. One of DAY, WEEK, MONTH, QUARTER, YEAR. Should match (or be coarser than) the granularity of timeDimensionId.',
    ),
    periodOffset: z
        .number()
        .int()
        .min(1)
        .describe(
            'Number of periods to look back. 1 = previous period (e.g. previous month). 12 with granularity=MONTH = "same month last year". 4 with granularity=QUARTER = "same quarter last year". Must be >= 1.',
        ),
});

export type PeriodComparison = z.infer<typeof periodComparisonSchema>;

export const periodComparisonsSchema = z
    .array(periodComparisonSchema)
    .nullable()
    .describe(
        `Add period-over-period comparisons to the query. For each entry, the backend generates an additional metric column with the base metric's value shifted back by periodOffset periods of the chosen granularity, and appends it to the query's metrics (and to the chart's yAxis if the base metric is there). Use null when no comparison is requested.

When to use:
- User asks "compare to last month / quarter / year"
- User asks "month-over-month", "year-over-year", "vs previous period"
- User asks "how does X compare to N {period}s ago"

Requirements:
1. The time dimension referenced by timeDimensionId MUST be in queryConfig.dimensions. If the user hasn't asked for it, add it.
2. baseMetricId must be a metric in queryConfig.metrics OR a custom metric defined in this query's customMetrics array.
3. granularity must be DAY/WEEK/MONTH/QUARTER/YEAR (no HOUR or finer, no RAW).
4. Multiple comparisons on the same base metric are allowed (e.g. MoM and YoY on the same metric in one query).

Example: "Show revenue by month, with previous-month comparison"
- queryConfig.dimensions: ["orders_created_at_month"]
- queryConfig.metrics: ["orders_revenue"]
- periodComparisons: [{ baseMetricId: "orders_revenue", timeDimensionId: "orders_created_at_month", granularity: "MONTH", periodOffset: 1 }]
The resulting query will have a "Revenue" column and a "Revenue (Previous month)" column.

Do NOT use for:
- YTD/MTD totals — those are aggregations, not shifts. Use customMetrics with a filter on the time dimension instead.
- Computing growth rate / % change — that's a tableCalculation referencing both columns. Add the comparison here first; PoP column IDs are auto-generated and not directly addressable from tableCalculations yet.`,
    );

export type PeriodComparisonsInput = z.infer<typeof periodComparisonsSchema>;
