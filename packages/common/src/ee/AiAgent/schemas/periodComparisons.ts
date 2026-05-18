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
            'Field ID of the metric to compare. Must appear in queryConfig.metrics or in customMetrics. Format: "table_metric_name".',
        ),
    timeDimensionId: z
        .string()
        .describe(
            'Field ID of the time dimension to anchor the comparison on. Must be present in queryConfig.dimensions. Format: "table_column_granularity" — the suffix encodes the bucket (e.g. "..._month" → MONTH bucket).',
        ),
    granularity: popGranularityEnum.describe(
        "Bucket unit for the offset. Must equal the bucket encoded in timeDimensionId's suffix.",
    ),
    periodOffset: z
        .number()
        .int()
        .min(1)
        .describe('Number of bucket units (granularity) to look back. >= 1.'),
});

export type PeriodComparison = z.infer<typeof periodComparisonSchema>;

export const periodComparisonsSchema = z
    .array(periodComparisonSchema)
    .nullable()
    .describe(
        `Each entry shifts a base metric back by (periodOffset × granularity) and appends the shifted value as a new column.

Constraints:
- timeDimensionId must be in queryConfig.dimensions.
- baseMetricId must be in queryConfig.metrics or in customMetrics.
- granularity must equal the bucket of timeDimensionId. Express longer comparisons by increasing periodOffset, not by raising granularity.

Use for "compare to last {period}", "month-over-month", "year-over-year", "vs N periods ago".
Do not use for YTD/MTD totals (use a filtered customMetric) or for % change (use a tableCalculation referencing the resulting columns).`,
    );

export type PeriodComparisonsInput = z.infer<typeof periodComparisonsSchema>;
