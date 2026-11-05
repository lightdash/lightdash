import type { EventAnalyticsQueryBase } from './eventAnalytics';

export type RetentionUnit = 'day' | 'week' | 'month';

/**
 * `first_time`: a user joins the cohort of the period in which they first did
 * the born event. `recurring`: a user joins the cohort of every period in
 * which they did the born event.
 */
export type RetentionCohortType = 'first_time' | 'recurring';

/**
 * `on`: a user counts in period N only if they returned during period N.
 * `on_or_after`: a user counts in period N if they returned during period N
 * or any later period.
 */
export type RetentionCriteria = 'on' | 'on_or_after';

/**
 * `rolling`: periods are measured from each user's birth event, so day 1 is
 * 24 to 48 hours after birth. `calendar`: periods are calendar buckets after
 * the birth bucket, so day 1 is the next calendar day.
 */
export type RetentionMode = 'rolling' | 'calendar';

export const RETENTION_MAX_PERIODS: Record<RetentionUnit, number> = {
    day: 60,
    week: 26,
    month: 24,
};

export const RETENTION_DEFAULT_PERIODS: Record<RetentionUnit, number> = {
    day: 14,
    week: 8,
    month: 6,
};

export type RetentionQueryRequest = EventAnalyticsQueryBase & {
    bornEvent: string;
    /** Null means any event counts as a return. */
    returnEvent: string | null;
    cohortType: RetentionCohortType;
    unit: RetentionUnit;
    /** The number of periods after period 0. Results have `periods + 1` buckets. */
    periods: number;
    criteria: RetentionCriteria;
    mode: RetentionMode;
};

export type RetentionCohortResult = {
    /** The start of the cohort bucket, as yyyy-mm-dd. */
    cohortDate: string;
    breakdownValue: string | null;
    cohortSize: number;
    /** Retained users per period. Index 0 is period 0. */
    counts: number[];
    /** Retained users as a percentage of `cohortSize`. Index 0 is period 0. */
    rates: number[];
    /** The highest period index that had fully elapsed when the query ran. -1 if none. */
    lastCompletePeriod: number;
};

export type RetentionAverageResult = {
    breakdownValue: string | null;
    /** The sum of cohort sizes that contributed to each period. */
    cohortSizes: number[];
    counts: number[];
    /** Null when no cohort has completed that period. */
    rates: (number | null)[];
};

export type RetentionQueryResult = {
    unit: RetentionUnit;
    periods: number;
    cohorts: RetentionCohortResult[];
    /** The cohort-size weighted mean over completed periods, one per breakdown value. */
    averages: RetentionAverageResult[];
    /** The SQL that produced the result, for debugging */
    sql: string;
};

export type ApiRetentionQueryResponse = {
    status: 'ok';
    results: RetentionQueryResult;
};

const UNIT_LABEL: Record<RetentionUnit, string> = {
    day: 'Day',
    week: 'Week',
    month: 'Month',
};

export function getRetentionPeriodLabel(
    unit: RetentionUnit,
    period: number,
): string {
    if (period === 0) return `< 1 ${UNIT_LABEL[unit]}`;
    return `${UNIT_LABEL[unit]} ${period}`;
}

const ROLLING_UNIT_MS: Record<RetentionUnit, number> = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000, // Rolling months are 30 days, as in Mixpanel
};

function addCalendarUnits(date: Date, unit: RetentionUnit, n: number): Date {
    const result = new Date(date);
    switch (unit) {
        case 'day':
            result.setUTCDate(result.getUTCDate() + n);
            return result;
        case 'week':
            result.setUTCDate(result.getUTCDate() + n * 7);
            return result;
        case 'month':
            result.setUTCMonth(result.getUTCMonth() + n);
            return result;
        default:
            return result;
    }
}

/**
 * Gets the highest period index that has fully elapsed for every user in the
 * cohort. A period is complete when its end, for the latest possible birth in
 * the cohort bucket, is in the past.
 */
export function getLastCompleteRetentionPeriod(
    cohortStart: Date,
    unit: RetentionUnit,
    mode: RetentionMode,
    periods: number,
    now: Date,
): number {
    let last = -1;
    for (let period = 0; period <= periods; period += 1) {
        // Calendar: period N ends at cohortStart + (N + 1) buckets.
        // Rolling: the latest birth is the end of the cohort bucket, and its
        // period N ends one more unit later.
        const periodEnd =
            mode === 'calendar'
                ? addCalendarUnits(cohortStart, unit, period + 1)
                : new Date(
                      addCalendarUnits(cohortStart, unit, 1).getTime() +
                          (period + 1) * ROLLING_UNIT_MS[unit],
                  );
        if (periodEnd.getTime() <= now.getTime()) {
            last = period;
        } else {
            break;
        }
    }
    return last;
}

/**
 * Computes the size-weighted average retention per period, using only
 * cohorts for which that period has completed. Equivalent to pooled retained
 * users divided by pooled cohort size.
 */
export function computeRetentionAverages(
    cohorts: RetentionCohortResult[],
    periods: number,
): RetentionAverageResult[] {
    const byBreakdown = new Map<string | null, RetentionCohortResult[]>();
    cohorts.forEach((cohort) => {
        const group = byBreakdown.get(cohort.breakdownValue) ?? [];
        group.push(cohort);
        byBreakdown.set(cohort.breakdownValue, group);
    });

    return [...byBreakdown.entries()].map(([breakdownValue, group]) => {
        const cohortSizes = Array<number>(periods + 1).fill(0);
        const counts = Array<number>(periods + 1).fill(0);
        group.forEach((cohort) => {
            for (
                let p = 0;
                p <= cohort.lastCompletePeriod && p <= periods;
                p += 1
            ) {
                cohortSizes[p] += cohort.cohortSize;
                counts[p] += cohort.counts[p] ?? 0;
            }
        });
        const rates = cohortSizes.map((size, p) =>
            size > 0 ? (counts[p] * 100) / size : null,
        );
        return { breakdownValue, cohortSizes, counts, rates };
    });
}
