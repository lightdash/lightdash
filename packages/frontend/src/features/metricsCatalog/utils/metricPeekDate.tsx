import { assertUnimplementedTimeframe, TimeFrames } from '@lightdash/common';
import dayjs from 'dayjs';
import { type DateRangePreset } from '../hooks/useDateRangePicker';

const DATE_FORMAT = 'MMM D, YYYY';
export const formatDate = (date: Date | null): string | undefined => {
    return date ? dayjs(date).format(DATE_FORMAT) : undefined;
};

/**
 * Get the date range presets for the metric peek date picker
 * @param timeInterval - The timeframe for which to get the date range presets
 * @returns The date range presets
 */
export const getDateRangePresets = (
    timeInterval: TimeFrames,
): DateRangePreset[] => {
    const now = dayjs();
    const today = now.startOf('day');

    switch (timeInterval) {
        // Timeframe: Day
        // Presets include:
        // - Today: From 00:00 until the current time
        // - Past 7 days: 7 full days plus the current day
        // - Past 30 days: 30 full days plus the current day
        // - Past 3 months: 12 full weeks plus the current week
        // - Past 12 months: 12 full months plus the current month
        // - Past 5 years: 5 full years plus the current year
        // - All time: No filter applied
        case TimeFrames.DAY:
            return [
                {
                    label: 'Today',
                    getValue: () => [today.toDate(), now.toDate()],
                    getTooltipLabel: () =>
                        `${today.format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 7 days',
                    getValue: () => [
                        today.subtract(7, 'day').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(7, 'day')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 30 days',
                    getValue: () => [
                        today.subtract(30, 'day').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(30, 'day')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 3 months',
                    getValue: () => [
                        today.subtract(12, 'week').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(12, 'week')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 12 months',
                    getValue: () => [
                        today.subtract(12, 'month').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(12, 'month')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 5 years',
                    getValue: () => [
                        today.subtract(5, 'year').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(5, 'year')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'All time',
                    getValue: () => [null, null],
                    getTooltipLabel: () => 'No filter',
                },
            ];

        // Timeframe: Week
        // Presets include:
        // - This week: From the start of the current week until now
        // - Past 1 week: 1 full week plus the current week
        // - Past 4 weeks: 4 full weeks plus the current week
        // - Past 3 months: 12 full weeks plus the current week
        // - Past 12 months: 12 full months plus the current month
        // - Past 5 years: 5 full years plus the current year
        // - All time: No filter applied
        case TimeFrames.WEEK:
            return [
                {
                    label: 'This week',
                    getValue: () => [
                        today.startOf('week').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .startOf('week')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 1 week',
                    getValue: () => [
                        today.subtract(1, 'week').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(1, 'week')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 4 weeks',
                    getValue: () => [
                        today.subtract(4, 'week').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(4, 'week')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 3 months',
                    getValue: () => [
                        today.subtract(12, 'week').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(12, 'week')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 12 months',
                    getValue: () => [
                        today.subtract(12, 'month').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(12, 'month')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 5 years',
                    getValue: () => [
                        today.subtract(5, 'year').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(5, 'year')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'All time',
                    getValue: () => [null, null],
                    getTooltipLabel: () => 'No filter',
                },
            ];

        // Timeframe: Month
        // Presets include:
        // - This month: From the start of the current month until now
        // - Past 3 months: 3 full months plus the current month
        // - Past 6 months: 6 full months plus the current month
        // - Past 12 months: 12 full months plus the current month
        // - Past 5 years: 5 full years plus the current year
        // - All time: No filter applied
        case TimeFrames.MONTH:
            return [
                {
                    label: 'This month',
                    getValue: () => [
                        today.startOf('month').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .startOf('month')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 3 months',
                    getValue: () => [
                        today.subtract(3, 'month').startOf('month').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(3, 'month')
                            .startOf('month')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 6 months',
                    getValue: () => [
                        today.subtract(6, 'month').startOf('month').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(6, 'month')
                            .startOf('month')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 12 months',
                    getValue: () => [
                        today.subtract(12, 'month').startOf('month').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(12, 'month')
                            .startOf('month')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 5 years',
                    getValue: () => [
                        today.subtract(5, 'year').startOf('year').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(5, 'year')
                            .startOf('year')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'All time',
                    getValue: () => [null, null],
                    getTooltipLabel: () => 'No filter',
                },
            ];

        // Timeframe: Year
        // Presets include:
        // - This year: From the start of the current year until now
        // - Past 1 year: 1 full year plus the current year
        // - Past 5 years: 5 full years plus the current year
        // - All time: No filter applied
        case TimeFrames.YEAR:
            return [
                {
                    label: 'This year',
                    getValue: () => [
                        today.startOf('year').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .startOf('year')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 1 year',
                    getValue: () => [
                        today.subtract(1, 'year').startOf('year').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(1, 'year')
                            .startOf('year')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'Past 5 years',
                    getValue: () => [
                        today.subtract(5, 'year').startOf('year').toDate(),
                        now.toDate(),
                    ],
                    getTooltipLabel: () =>
                        `${today
                            .subtract(5, 'year')
                            .startOf('year')
                            .format('MMM D, YYYY')} - ${now.format(
                            'MMM D, YYYY',
                        )}`,
                },
                {
                    label: 'All time',
                    getValue: () => [null, null],
                    getTooltipLabel: () => 'No filter',
                },
            ];

        default:
            return assertUnimplementedTimeframe(timeInterval);
    }
};
