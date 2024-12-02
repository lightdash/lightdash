import { TimeFrames, type MetricExplorerDateRange } from '@lightdash/common';
import dayjs from 'dayjs';
import { type DateRangePreset } from '../hooks/useDateRangePicker';

const DATE_FORMAT = 'MMM D, YYYY';
export const formatDate = (date: Date | null): string | undefined => {
    return date ? dayjs(date).format(DATE_FORMAT) : undefined;
};

/**
 * Get the date range presets for the metric peek date picker
 * Preset	What does it mean?
 * Today - 00:00 until present time |
 * Past 7 days - 7 full days + this unfinished day |
 * Past 30 days - 30 full days + this unfinished day |
 * Past 3 months - 12 full weeks + this unfinished week |
 * Past 12 months - 12 full months + this unfinished month |
 * Past 5 years - 5 full years + this unfinished year |
 * All time / empty state - No filter |
 * @returns The date range presets
 */
export const getDateRangePresets = (): DateRangePreset[] => {
    const now = dayjs();
    const today = now.startOf('day');

    const presets: DateRangePreset[] = [
        {
            label: 'Today',
            getValue: () => [today.toDate(), now.toDate()],
            getTooltipLabel: () =>
                `${today.format('MMM D, YYYY')} - ${now.format('MMM D, YYYY')}`,
        },
        {
            label: 'Past 7 days',
            getValue: () => [today.subtract(7, 'day').toDate(), now.toDate()],
            getTooltipLabel: () =>
                `${today
                    .subtract(7, 'day')
                    .format('MMM D, YYYY')} - ${now.format('MMM D, YYYY')}`,
        },
        {
            label: 'Past 30 days',
            getValue: () => [today.subtract(30, 'day').toDate(), now.toDate()],
            getTooltipLabel: () =>
                `${today
                    .subtract(30, 'day')
                    .format('MMM D, YYYY')} - ${now.format('MMM D, YYYY')}`,
        },
        {
            label: 'Past 3 months',
            getValue: () => [today.subtract(12, 'week').toDate(), now.toDate()],
            getTooltipLabel: () =>
                `${today
                    .subtract(12, 'week')
                    .format('MMM D, YYYY')} - ${now.format('MMM D, YYYY')}`,
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
                    .format('MMM D, YYYY')} - ${now.format('MMM D, YYYY')}`,
        },
        {
            label: 'Past 5 years',
            getValue: () => [today.subtract(5, 'year').toDate(), now.toDate()],
            getTooltipLabel: () =>
                `${today
                    .subtract(5, 'year')
                    .format('MMM D, YYYY')} - ${now.format('MMM D, YYYY')}`,
        },
        {
            label: 'All time',
            getValue: () => [null, null],
            getTooltipLabel: () => 'No filter',
        },
    ];

    return presets;
};

/**
 * Get the date range for a given time interval, based on the current date and the time interval
 * Time grain Year: -> past 5 years (i.e. 5 completed years + this uncompleted year)
 * Time grain Month -> past 12 months (i.e. 12 completed months + this uncompleted month)
 * Time grain Week -> past 12 weeks (i.e. 12 completed weeks + this uncompleted week)
 * Time grain Day -> past 30 days (i.e. 30 completed days + this uncompleted day)
 * @param timeInterval - The time interval
 * @returns The date range
 */
export const getDefaultDateRangeFromInterval = (
    timeInterval: TimeFrames | undefined,
): MetricExplorerDateRange => {
    if (!timeInterval) {
        return [null, null];
    }

    const now = dayjs();

    switch (timeInterval) {
        case TimeFrames.DAY:
            // Past 30 days (29 completed days + current day)
            return [
                now.subtract(29, 'day').startOf('day').toDate(),
                now.toDate(),
            ];
        case TimeFrames.WEEK:
            // Past 12 weeks (11 completed weeks + current week)
            return [
                now.subtract(11, 'week').startOf('week').toDate(),
                now.toDate(),
            ];
        case TimeFrames.MONTH:
            // Past 12 months (11 completed months + current month)
            return [
                now.subtract(11, 'month').startOf('month').toDate(),
                now.toDate(),
            ];
        case TimeFrames.YEAR:
            // Past 5 years (4 completed years + current year)
            return [
                now.subtract(4, 'year').startOf('year').toDate(),
                now.toDate(),
            ];
        default:
            return [null, null];
    }
};
