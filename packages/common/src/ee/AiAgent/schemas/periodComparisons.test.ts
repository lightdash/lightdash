import { TimeFrames } from '../../../types/timeFrames';
import { periodComparisonsSchema } from './periodComparisons';

describe('periodComparisonsSchema', () => {
    const validEntry = {
        baseMetricId: 'orders_revenue',
        timeDimensionId: 'orders_created_at_month',
        granularity: TimeFrames.MONTH,
        periodOffset: 1,
    };

    it('accepts a valid single entry', () => {
        const result = periodComparisonsSchema.safeParse([validEntry]);
        expect(result.success).toBe(true);
    });

    it('accepts null', () => {
        const result = periodComparisonsSchema.safeParse(null);
        expect(result.success).toBe(true);
    });

    it('accepts an empty array', () => {
        const result = periodComparisonsSchema.safeParse([]);
        expect(result.success).toBe(true);
    });

    it('accepts multiple entries on the same base metric', () => {
        const result = periodComparisonsSchema.safeParse([
            validEntry,
            { ...validEntry, granularity: TimeFrames.YEAR, periodOffset: 1 },
        ]);
        expect(result.success).toBe(true);
    });

    it('rejects periodOffset of 0', () => {
        const result = periodComparisonsSchema.safeParse([
            { ...validEntry, periodOffset: 0 },
        ]);
        expect(result.success).toBe(false);
    });

    it('rejects negative periodOffset', () => {
        const result = periodComparisonsSchema.safeParse([
            { ...validEntry, periodOffset: -3 },
        ]);
        expect(result.success).toBe(false);
    });

    it('rejects non-integer periodOffset', () => {
        const result = periodComparisonsSchema.safeParse([
            { ...validEntry, periodOffset: 1.5 },
        ]);
        expect(result.success).toBe(false);
    });

    it('rejects unsupported granularity (HOUR)', () => {
        const result = periodComparisonsSchema.safeParse([
            { ...validEntry, granularity: TimeFrames.HOUR },
        ]);
        expect(result.success).toBe(false);
    });

    it('rejects unsupported granularity (RAW)', () => {
        const result = periodComparisonsSchema.safeParse([
            { ...validEntry, granularity: TimeFrames.RAW },
        ]);
        expect(result.success).toBe(false);
    });

    it('rejects missing required fields', () => {
        const withoutBase = {
            timeDimensionId: validEntry.timeDimensionId,
            granularity: validEntry.granularity,
            periodOffset: validEntry.periodOffset,
        };
        expect(periodComparisonsSchema.safeParse([withoutBase]).success).toBe(
            false,
        );

        const withoutDim = {
            baseMetricId: validEntry.baseMetricId,
            granularity: validEntry.granularity,
            periodOffset: validEntry.periodOffset,
        };
        expect(periodComparisonsSchema.safeParse([withoutDim]).success).toBe(
            false,
        );
    });
});
