import {
    type AiBillableFeature,
    type AiCreditDailyUsage,
    type AiCreditPeriod,
} from '@lightdash/common';

const DAY_MS = 24 * 60 * 60 * 1000;

export type AiCreditDailyUsageEntry = {
    date: string;
    feature: AiBillableFeature;
    credits: number;
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

/** One series per feature with usage, largest first, over every day of the period. */
export const buildAiCreditDailyUsage = ({
    period,
    entries,
}: {
    period: AiCreditPeriod;
    entries: AiCreditDailyUsageEntry[];
}): AiCreditDailyUsage => {
    const totals = new Map<AiBillableFeature, number>();
    entries.forEach(({ feature, credits }) =>
        totals.set(feature, (totals.get(feature) ?? 0) + credits),
    );
    const features = [...totals.entries()]
        .filter(([, credits]) => credits > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([feature]) => feature);
    const featureIndex = new Map(
        features.map((feature, index) => [feature, index]),
    );

    const days = listPeriodDays(period);
    const dayIndex = new Map(days.map((date, index) => [date, index]));
    // Mutated in place: a year-long period has too many cells to copy per entry.
    const creditsByDay = days.map(() => features.map(() => 0));
    entries.forEach(({ date, feature, credits }) => {
        const day = dayIndex.get(date);
        const index = featureIndex.get(feature);
        if (day === undefined || index === undefined) return;
        creditsByDay[day][index] += credits;
    });

    return {
        period,
        series: features.map((feature, index) => ({
            feature,
            credits: creditsByDay.reduce((sum, row) => sum + row[index], 0),
        })),
        days: days.map((date, index) => ({
            date,
            credits: creditsByDay[index],
        })),
    };
};
