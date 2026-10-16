import {
    assertUnimplementedTimeframe,
    getDefaultDateRangeFromInterval,
    TimeFrames,
    type MetricExplorerPartialDateRange,
} from '@lightdash/common';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import i18n from '../../../i18n/i18n';
import { type DateRangePreset } from '../hooks/useDateRangePicker';

const ns = 'metricsCatalog';

dayjs.extend(isoWeek);

const DATE_FORMAT = 'MMM D, YYYY';
export const formatDate = (date: Date | null): string | undefined => {
    return date ? dayjs(date).format(DATE_FORMAT) : undefined;
};

/**
 * Get the date range presets for the metric explore date picker
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
                    label: i18n.t('datePresets.labels.today', { ns }),
                    controlLabel: i18n.t('datePresets.labels.today', { ns }),
                    getValue: () => [today.toDate(), now.toDate()],
                },
                {
                    label: i18n.t('datePresets.labels.past7Days', { ns }),
                    controlLabel: i18n.t('datePresets.controls.d7', { ns }),
                    getValue: () => [
                        today.subtract(7, 'day').toDate(),
                        now.toDate(),
                    ],
                },
                {
                    label: i18n.t('datePresets.labels.past30Days', { ns }),
                    controlLabel: i18n.t('datePresets.controls.d30', { ns }),
                    getValue: () =>
                        getDefaultDateRangeFromInterval(timeInterval),
                },
                {
                    label: i18n.t('datePresets.labels.past3Months', { ns }),
                    controlLabel: i18n.t('datePresets.controls.m3', { ns }),
                    getValue: () => [
                        today.subtract(12, 'week').toDate(),
                        now.toDate(),
                    ],
                },
                {
                    label: i18n.t('datePresets.labels.past12Months', { ns }),
                    controlLabel: i18n.t('datePresets.controls.m12', { ns }),
                    getValue: () => [
                        today.subtract(12, 'month').toDate(),
                        now.toDate(),
                    ],
                },
                {
                    label: i18n.t('datePresets.labels.past5Years', { ns }),
                    controlLabel: i18n.t('datePresets.controls.y5', { ns }),
                    getValue: () => [
                        today.subtract(5, 'year').toDate(),
                        now.toDate(),
                    ],
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
                    label: i18n.t('datePresets.labels.thisWeek', { ns }),
                    controlLabel: i18n.t('datePresets.labels.thisWeek', { ns }),
                    getValue: () => [
                        today.startOf('isoWeek').toDate(),
                        now.toDate(),
                    ],
                },
                {
                    label: i18n.t('datePresets.labels.past1Week', { ns }),
                    controlLabel: i18n.t('datePresets.controls.w1', { ns }),
                    getValue: () => [
                        today.subtract(1, 'week').startOf('isoWeek').toDate(),
                        now.toDate(),
                    ],
                },
                {
                    label: i18n.t('datePresets.labels.past4Weeks', { ns }),
                    controlLabel: i18n.t('datePresets.controls.w4', { ns }),
                    getValue: () => [
                        today.subtract(4, 'week').startOf('isoWeek').toDate(),
                        now.toDate(),
                    ],
                },
                {
                    label: i18n.t('datePresets.labels.past3Months', { ns }),
                    controlLabel: i18n.t('datePresets.controls.m3', { ns }),
                    getValue: () =>
                        getDefaultDateRangeFromInterval(timeInterval),
                },
                {
                    label: i18n.t('datePresets.labels.past12Months', { ns }),
                    controlLabel: i18n.t('datePresets.controls.m12', { ns }),
                    getValue: () => [
                        today.subtract(12, 'month').startOf('month').toDate(),
                        now.toDate(),
                    ],
                },
                {
                    label: i18n.t('datePresets.labels.past5Years', { ns }),
                    controlLabel: i18n.t('datePresets.controls.y5', { ns }),
                    getValue: () => [
                        today.subtract(5, 'year').startOf('year').toDate(),
                        now.toDate(),
                    ],
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
                    label: i18n.t('datePresets.labels.thisMonth', { ns }),
                    controlLabel: i18n.t('datePresets.labels.thisMonth', {
                        ns,
                    }),
                    getValue: () => [
                        today.startOf('month').toDate(),
                        now.toDate(),
                    ],
                },
                {
                    label: i18n.t('datePresets.labels.past3Months', { ns }),
                    controlLabel: i18n.t('datePresets.controls.m3', { ns }),
                    getValue: () => [
                        today.subtract(3, 'month').startOf('month').toDate(),
                        now.toDate(),
                    ],
                },
                {
                    label: i18n.t('datePresets.labels.past6Months', { ns }),
                    controlLabel: i18n.t('datePresets.controls.m6', { ns }),
                    getValue: () => [
                        today.subtract(6, 'month').startOf('month').toDate(),
                        now.toDate(),
                    ],
                },
                {
                    label: i18n.t('datePresets.labels.past12Months', { ns }),
                    controlLabel: i18n.t('datePresets.controls.m12', { ns }),
                    getValue: () =>
                        getDefaultDateRangeFromInterval(timeInterval),
                },
                {
                    label: i18n.t('datePresets.labels.past5Years', { ns }),
                    controlLabel: i18n.t('datePresets.controls.y5', { ns }),
                    getValue: () => [
                        today.subtract(5, 'year').startOf('year').toDate(),
                        now.toDate(),
                    ],
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
                    label: i18n.t('datePresets.labels.thisYear', { ns }),
                    controlLabel: i18n.t('datePresets.labels.thisYear', { ns }),
                    getValue: () => [
                        today.startOf('year').toDate(),
                        now.toDate(),
                    ],
                },
                {
                    label: i18n.t('datePresets.labels.past1Year', { ns }),
                    controlLabel: i18n.t('datePresets.controls.y1', { ns }),
                    getValue: () => [
                        today.subtract(1, 'year').startOf('year').toDate(),
                        now.toDate(),
                    ],
                },
                {
                    label: i18n.t('datePresets.labels.past3Years', { ns }),
                    controlLabel: i18n.t('datePresets.controls.y3', { ns }),
                    getValue: () =>
                        getDefaultDateRangeFromInterval(timeInterval),
                },
                {
                    label: i18n.t('datePresets.labels.past5Years', { ns }),
                    controlLabel: i18n.t('datePresets.controls.y5', { ns }),
                    getValue: () => [
                        today.subtract(5, 'year').startOf('year').toDate(),
                        now.toDate(),
                    ],
                },
            ];

        default:
            return assertUnimplementedTimeframe(timeInterval);
    }
};

/**
 * Checks if two date ranges are equal, handling null values
 */
const areDateRangesEqual = (
    range1: MetricExplorerPartialDateRange,
    range2: MetricExplorerPartialDateRange,
    timeInterval: TimeFrames,
): boolean => {
    if (
        range1[0] === null &&
        range2[0] === null &&
        range1[1] === null &&
        range2[1] === null
    ) {
        return true;
    }

    let isSameTimeInterval: dayjs.OpUnitType | undefined;
    switch (timeInterval) {
        case TimeFrames.DAY:
            isSameTimeInterval = 'day';
            break;
        case TimeFrames.WEEK:
            isSameTimeInterval = 'week';
            break;
        case TimeFrames.MONTH:
            isSameTimeInterval = 'month';
            break;
        case TimeFrames.YEAR:
            isSameTimeInterval = 'year';
            break;
        default:
            isSameTimeInterval = undefined;
    }

    return (
        dayjs(range1[0]).isSame(dayjs(range2[0]), isSameTimeInterval) &&
        dayjs(range1[1]).isSame(dayjs(range2[1]), isSameTimeInterval)
    );
};

/**
 * Gets the matching preset control label for a given date range
 */
export const getMatchingPresetLabel = (
    dateRange: [Date | null, Date | null],
    timeInterval: TimeFrames,
): string | undefined => {
    const presets = getDateRangePresets(timeInterval);
    const matchingPreset = presets.find((preset) => {
        return areDateRangesEqual(preset.getValue(), dateRange, timeInterval);
    });
    return matchingPreset?.controlLabel;
};
