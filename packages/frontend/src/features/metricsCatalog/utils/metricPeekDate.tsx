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
