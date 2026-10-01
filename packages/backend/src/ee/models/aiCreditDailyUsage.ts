import {
    assertUnreachable,
    type AiCreditDailyUsage,
    type AiCreditDailyUsageSeries,
    type AiCreditPeriod,
    type AiCreditUsageBreakdown,
} from '@lightdash/common';

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_SERIES_COUNT = 5;

// Where one priced group of calls belongs before names are resolved.
export type AiCreditDailyUsageBucket =
    | { type: 'value'; key: string }
    | { type: 'embeddedViewers' }
    | { type: 'unattributed' };

export type AiCreditDailyUsageEntry = {
    date: string;
    bucket: AiCreditDailyUsageBucket;
    credits: number;
};

type ResolvedBucket =
    | { type: 'value'; key: string; name: string | null }
    | { type: 'deleted' }
    | { type: 'embeddedViewers' }
    | { type: 'unattributed' };

export const breakdownHasNames = (
    breakdown: AiCreditUsageBreakdown,
): boolean => {
    switch (breakdown) {
        case 'feature':
        case 'channel':
            return false;
        case 'user':
        case 'project':
        case 'agent':
            return true;
        default:
            return assertUnreachable(
                breakdown,
                `Unknown AI credit usage breakdown ${breakdown}`,
            );
    }
};

export const toUtcDate = (at: Date): string => at.toISOString().slice(0, 10);

/** Every UTC calendar day the period touches, in order. */
export const listPeriodDays = (period: AiCreditPeriod): string[] => {
    const first = Date.parse(toUtcDate(period.periodStart));
    const lastInstant = period.periodEnd.getTime() - 1;
    const count = Math.floor((lastInstant - first) / DAY_MS) + 1;
    return Array.from({ length: Math.max(count, 0) }, (_, index) =>
        toUtcDate(new Date(first + index * DAY_MS)),
    );
};

const resolveBucket = (
    bucket: AiCreditDailyUsageBucket,
    names: ReadonlyMap<string, string> | null,
): ResolvedBucket => {
    if (bucket.type !== 'value') return bucket;
    if (names === null) return { ...bucket, name: null };
    const name = names.get(bucket.key);
    return name === undefined ? { type: 'deleted' } : { ...bucket, name };
};

const bucketId = (bucket: ResolvedBucket): string =>
    bucket.type === 'value' ? `value:${bucket.key}` : bucket.type;

type SeriesSlot = {
    id: string;
    toSeries: (credits: number) => AiCreditDailyUsageSeries;
};

const toSlot = (bucket: ResolvedBucket): SeriesSlot => ({
    id: bucketId(bucket),
    toSeries: (credits) =>
        bucket.type === 'value'
            ? { type: 'value', key: bucket.key, name: bucket.name, credits }
            : { type: bucket.type, credits },
});

const OTHER_SLOT: SeriesSlot = {
    id: 'other',
    toSeries: (credits) => ({ type: 'other', credits }),
};

/**
 * Keeps the largest few buckets as their own series and folds the rest into
 * "other", so the chart stays readable however many users or projects there are.
 * `names` is null for breakdowns the app labels itself; a key missing from it was deleted.
 */
export const buildAiCreditDailyUsage = ({
    period,
    breakdown,
    entries,
    names,
}: {
    period: AiCreditPeriod;
    breakdown: AiCreditUsageBreakdown;
    entries: AiCreditDailyUsageEntry[];
    names: ReadonlyMap<string, string> | null;
}): AiCreditDailyUsage => {
    const resolved = entries.map((entry) => ({
        ...entry,
        slot: toSlot(resolveBucket(entry.bucket, names)),
    }));
    const totals = new Map<string, number>();
    resolved.forEach(({ slot, credits }) =>
        totals.set(slot.id, (totals.get(slot.id) ?? 0) + credits),
    );
    const slotsById = new Map(resolved.map(({ slot }) => [slot.id, slot]));
    const ranked = [...totals.entries()]
        .filter(([, credits]) => credits > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([id]) => id);
    // Folding a single leftover into "other" would hide it for no gain.
    const keptIds =
        ranked.length <= TOP_SERIES_COUNT + 1
            ? ranked
            : ranked.slice(0, TOP_SERIES_COUNT);
    const keptSlots = keptIds.flatMap((id) => {
        const slot = slotsById.get(id);
        return slot === undefined ? [] : [slot];
    });
    const hasOther = keptIds.length < ranked.length;
    const slots = hasOther ? [...keptSlots, OTHER_SLOT] : keptSlots;
    const slotIndex = new Map(slots.map((slot, index) => [slot.id, index]));
    const otherIndex = hasOther ? slots.length - 1 : -1;

    const days = listPeriodDays(period);
    const dayIndex = new Map(days.map((date, index) => [date, index]));
    // Mutated in place: a year-long period has too many cells to copy per entry.
    const creditsByDay = days.map(() => slots.map(() => 0));
    resolved.forEach(({ date, slot, credits }) => {
        const day = dayIndex.get(date);
        const index = slotIndex.get(slot.id) ?? otherIndex;
        if (day === undefined || index === -1) return;
        creditsByDay[day][index] += credits;
    });
    const slotTotals = slots.map((_, index) =>
        creditsByDay.reduce((sum, row) => sum + row[index], 0),
    );

    return {
        period,
        breakdown,
        series: slots.map((slot, index) => slot.toSeries(slotTotals[index])),
        days: days.map((date, index) => ({
            date,
            credits: creditsByDay[index],
        })),
    };
};
