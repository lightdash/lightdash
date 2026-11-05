import { describe, expect, it } from 'vitest';
import {
    computeRetentionAverages,
    getLastCompleteRetentionPeriod,
    getRetentionPeriodLabel,
    type RetentionCohortResult,
} from './retention';

describe('getRetentionPeriodLabel', () => {
    it('labels period 0 as less than one unit', () => {
        expect(getRetentionPeriodLabel('day', 0)).toBe('< 1 Day');
        expect(getRetentionPeriodLabel('week', 3)).toBe('Week 3');
        expect(getRetentionPeriodLabel('month', 1)).toBe('Month 1');
    });
});

describe('getLastCompleteRetentionPeriod', () => {
    const cohortStart = new Date('2024-01-01T00:00:00Z');

    it('calendar day: period N is complete once N+1 days have passed', () => {
        const now = new Date('2024-01-03T12:00:00Z');
        // day 0 ended 2024-01-02, day 1 ended 2024-01-03, day 2 ends 2024-01-04
        expect(
            getLastCompleteRetentionPeriod(
                cohortStart,
                'day',
                'calendar',
                7,
                now,
            ),
        ).toBe(1);
    });

    it('rolling day: needs one extra day for the latest birth in the bucket', () => {
        const now = new Date('2024-01-03T12:00:00Z');
        // latest birth is end of 2024-01-01; its day 0 ends 2024-01-03, day 1 ends 2024-01-04
        expect(
            getLastCompleteRetentionPeriod(
                cohortStart,
                'day',
                'rolling',
                7,
                now,
            ),
        ).toBe(0);
    });

    it('calendar month uses calendar months', () => {
        const now = new Date('2024-03-15T00:00:00Z');
        expect(
            getLastCompleteRetentionPeriod(
                cohortStart,
                'month',
                'calendar',
                6,
                now,
            ),
        ).toBe(1);
    });

    it('returns -1 when nothing is complete', () => {
        expect(
            getLastCompleteRetentionPeriod(
                cohortStart,
                'week',
                'calendar',
                4,
                new Date('2024-01-02T00:00:00Z'),
            ),
        ).toBe(-1);
    });

    it('caps at the requested number of periods', () => {
        expect(
            getLastCompleteRetentionPeriod(
                cohortStart,
                'day',
                'calendar',
                3,
                new Date('2025-01-01T00:00:00Z'),
            ),
        ).toBe(3);
    });
});

describe('computeRetentionAverages', () => {
    const cohort = (
        cohortDate: string,
        cohortSize: number,
        counts: number[],
        lastCompletePeriod: number,
        breakdownValue: string | null = null,
    ): RetentionCohortResult => ({
        cohortDate,
        breakdownValue,
        cohortSize,
        counts,
        rates: counts.map((c) => (c * 100) / cohortSize),
        lastCompletePeriod,
    });

    it('pools retained users over completed periods only', () => {
        const averages = computeRetentionAverages(
            [
                cohort('2024-01-01', 1000, [1000, 500, 400], 2),
                cohort('2024-01-02', 500, [500, 400, 100], 1),
            ],
            2,
        );
        expect(averages).toHaveLength(1);
        expect(averages[0].breakdownValue).toBeNull();
        expect(averages[0].cohortSizes).toEqual([1500, 1500, 1000]);
        expect(averages[0].counts).toEqual([1500, 900, 400]);
        expect(averages[0].rates).toEqual([100, 60, 40]);
    });

    it('returns null rates when no cohort completed a period', () => {
        const averages = computeRetentionAverages(
            [cohort('2024-01-01', 10, [10, 3], -1)],
            1,
        );
        expect(averages[0].rates).toEqual([null, null]);
    });

    it('averages per breakdown value', () => {
        const averages = computeRetentionAverages(
            [
                cohort('2024-01-01', 10, [10, 5], 1, 'ios'),
                cohort('2024-01-01', 20, [20, 2], 1, 'android'),
            ],
            1,
        );
        expect(averages.map((a) => a.breakdownValue)).toEqual([
            'ios',
            'android',
        ]);
        expect(averages[0].rates).toEqual([100, 50]);
        expect(averages[1].rates).toEqual([100, 10]);
    });
});
