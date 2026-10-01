import {
    type AiCreditDailyUsage,
    type AiCreditDailyUsageSeries,
} from '@lightdash/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

// Beyond about a quarter, daily bars are too thin to read, so days are summed per week.
const MAX_DAILY_BARS = 93;
const DAYS_PER_WEEK = 7;

const SERIES_COLORS = [
    'var(--mantine-color-violet-6)',
    'var(--mantine-color-blue-6)',
    'var(--mantine-color-teal-6)',
    'var(--mantine-color-orange-6)',
    'var(--mantine-color-pink-6)',
    'var(--mantine-color-cyan-6)',
] as const;

const COMBINED_SERIES_COLOR = 'var(--mantine-color-ldGray-5)';

export const getAiCreditSeriesColor = (
    series: AiCreditDailyUsageSeries,
    index: number,
): string =>
    series.type === 'other'
        ? COMBINED_SERIES_COLOR
        : SERIES_COLORS[index % SERIES_COLORS.length];

export type AiCreditChartBucket = {
    label: string;
    // Credits per series, in the same order as the usage's series.
    credits: number[];
};

const formatDay = (date: string) => dayjs.utc(date).format('D MMM');

const sumColumns = (rows: number[][], width: number): number[] =>
    Array.from({ length: width }, (_, column) =>
        rows.reduce((sum, row) => sum + row[column], 0),
    );

export const toAiCreditChartBuckets = (
    usage: Pick<AiCreditDailyUsage, 'days' | 'series'>,
): AiCreditChartBucket[] => {
    if (usage.days.length <= MAX_DAILY_BARS) {
        return usage.days.map((day) => ({
            label: formatDay(day.date),
            credits: day.credits,
        }));
    }
    const weekCount = Math.ceil(usage.days.length / DAYS_PER_WEEK);
    return Array.from({ length: weekCount }, (_, week) => {
        const days = usage.days.slice(
            week * DAYS_PER_WEEK,
            (week + 1) * DAYS_PER_WEEK,
        );
        return {
            label: `Week of ${formatDay(days[0].date)}`,
            credits: sumColumns(
                days.map((day) => day.credits),
                usage.series.length,
            ),
        };
    });
};

/**
 * A row's bar is measured against the allowance, so the rows add up to the
 * main usage bar; without an allowance, against everything used this period.
 */
export const getAiCreditRowShare = ({
    credits,
    allowanceCredits,
    usedCredits,
}: {
    credits: number;
    allowanceCredits: number | null;
    usedCredits: number;
}): number => {
    const measure =
        allowanceCredits !== null && allowanceCredits > 0
            ? allowanceCredits
            : usedCredits;
    if (measure <= 0) return 0;
    return Math.min(Math.max((credits / measure) * 100, 0), 100);
};
