import {
    TimeFrames,
    assertUnimplementedTimeframe,
    type MetricExplorerDateRange,
    type MetricExplorerPartialDateRange,
} from '@lightdash/common';
import { type MantineTheme } from '@mantine/core';
import {
    type DatePickerProps,
    type MonthPickerProps,
    type YearPickerProps,
} from '@mantine/dates';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, getDateRangePresets } from '../utils/metricExploreDate';

dayjs.extend(isoWeek);

type DateRange = MetricExplorerPartialDateRange;

export interface DateRangePreset {
    label: string;
    controlLabel: string;
    getValue: () => DateRange;
}

interface UseDateRangePickerProps {
    value: MetricExplorerDateRange;
    onChange?: (range: MetricExplorerDateRange) => void;
    timeInterval: TimeFrames;
}

type BaseCalendarProps = {
    value: DateRange;
    onChange: (dates: DateRange) => void;
};

type DayPickerConfig = {
    type: TimeFrames.DAY;
    props: BaseCalendarProps & Omit<DatePickerProps, 'value' | 'onChange'>;
};

type WeekPickerConfig = {
    type: TimeFrames.WEEK;
    props: BaseCalendarProps & Omit<DatePickerProps, 'value' | 'onChange'>;
};

type MonthPickerConfig = {
    type: TimeFrames.MONTH;
    props: BaseCalendarProps & Omit<MonthPickerProps, 'value' | 'onChange'>;
};

type YearPickerConfig = {
    type: TimeFrames.YEAR;
    props: BaseCalendarProps & Omit<YearPickerProps, 'value' | 'onChange'>;
};

type CalendarVisualizationType =
    | DayPickerConfig
    | WeekPickerConfig
    | MonthPickerConfig
    | YearPickerConfig
    | undefined;

const getCommonCalendarStyles = (theme: MantineTheme) => ({
    yearLevel: {
        color: theme.colors.ldGray[7],
        padding: theme.spacing.xs,
        '&[data-year-level]:not(:last-of-type)': {
            borderRight: `1px solid ${theme.colors.ldGray[2]}`,
            marginRight: 0,
        },
        '&[data-year-level]:not(:first-of-type)': {
            paddingRight: 0,
        },
    },
    decadeLevel: {
        color: theme.colors.ldGray[7],
        padding: theme.spacing.xs,
        '&[data-decade-level]:not(:last-of-type)': {
            borderRight: `1px solid ${theme.colors.ldGray[2]}`,
            marginRight: 0,
        },
        '&[data-decade-level]:not(:first-of-type)': {
            paddingLeft: 0,
            paddingRight: 0,
        },
    },
    calendarHeaderControlIcon: {
        color: theme.colors.ldGray[5],
    },
    calendarHeaderLevel: {
        color: theme.colors.ldGray[7],
    },
    monthLevel: {
        padding: theme.spacing.xs,
        '&[data-month-level]:not(:last-of-type)': {
            borderRight: `1px solid ${theme.colors.ldGray[2]}`,
            marginRight: 0,
        },
    },
    pickerControl: {
        '&[data-selected]': {
            backgroundColor: theme.colors.ldDark[7],
            borderRadius: theme.radius.md,
        },
        '&[data-selected]:hover': {
            backgroundColor: theme.colors.ldDark[9],
            borderRadius: theme.radius.md,
        },
        '&[data-in-range]': {
            backgroundColor: theme.colors.ldGray[1],
        },
        '&[data-in-range]:hover': {
            backgroundColor: theme.colors.ldGray[1],
        },
        '&[data-last-in-range][data-first-in-range]': {
            borderRadius: theme.radius.md,
        },
    },
    day: {
        borderRadius: theme.radius.lg,
        '&[data-weekend="true"]&:not([data-selected])': {
            color: theme.colors.ldGray[7],
        },
        '&[data-in-range]': {
            backgroundColor: theme.colors.ldGray[1],
        },
        '&[data-in-range]:hover': {
            backgroundColor: theme.colors.ldGray[1],
        },
        '&[data-selected]': {
            backgroundColor: theme.colors.ldDark[7],
            borderRadius: theme.radius.lg,
        },
        '&[data-selected]:hover': {
            backgroundColor: theme.colors.ldDark[9],
            borderRadius: theme.radius.lg,
        },
    },
    monthsList: {
        padding: theme.spacing.xs,
    },
    monthsListCell: {
        '&[data-selected]': {
            backgroundColor: theme.colors.ldDark[7],
            borderRadius: theme.radius.lg,
        },
        '&[data-selected]:hover': {
            backgroundColor: theme.colors.ldDark[9],
        },
        '&[data-in-range]': {
            backgroundColor: theme.colors.ldGray[1],
        },
        '&[data-in-range]:hover': {
            backgroundColor: theme.colors.ldGray[1],
        },
    },
    yearsList: {
        padding: theme.spacing.xs,
    },
    yearsListCell: {
        '&[data-selected]': {
            backgroundColor: theme.colors.ldDark[7],
            borderRadius: theme.radius.lg,
        },
        '&[data-selected]:hover': {
            backgroundColor: theme.colors.ldDark[9],
        },
        '&[data-in-range]': {
            backgroundColor: theme.colors.ldGray[1],
        },
        '&[data-in-range]:hover': {
            backgroundColor: theme.colors.ldGray[1],
        },
    },
});

/**
 * Hook to handle the date range picker for the metric peek
 * This hook handles the open/close state of the date range picker,
 * the date range itself, the selected preset, and the temp date range
 * (used when the user is selecting a preset, but has not applied it yet)
 */
export const useDateRangePicker = ({
    value,
    onChange,
    timeInterval,
}: UseDateRangePickerProps) => {
    const presets = getDateRangePresets(timeInterval);

    const [isOpen, setIsOpen] = useState(false);

    const [dateRange, setDateRange] = useState<DateRange>(value);

    const [tempDateRange, setTempDateRange] = useState<DateRange>(dateRange);

    const [selectedPreset, setSelectedPreset] =
        useState<DateRangePreset | null>(null);
    const [tempSelectedPreset, setTempSelectedPreset] =
        useState<DateRangePreset | null>(null);

    const [initialWeek, setInitialWeek] = useState<Date | null>(null);

    useEffect(() => {
        setDateRange(value);
        onChange?.(value);
    }, [value, onChange]);

    const buttonLabel = useMemo(() => {
        if (selectedPreset) {
            return selectedPreset.label;
        }
        if (dateRange[0]) {
            return dateRange[1]
                ? `${formatDate(dateRange[0])} - ${formatDate(dateRange[1])}`
                : formatDate(dateRange[0]);
        }
        return 'Select date range';
    }, [selectedPreset, dateRange]);

    const formattedTempDateRange = useMemo(() => {
        return [formatDate(tempDateRange[0]), formatDate(tempDateRange[1])];
    }, [tempDateRange]);

    const handleOpen = (open: boolean) => {
        if (open) {
            setTempDateRange(dateRange);
            setTempSelectedPreset(selectedPreset);
        }
        setIsOpen(open);
    };

    const handleApply = () => {
        setDateRange(tempDateRange);
        setSelectedPreset(tempSelectedPreset);

        // Reset initialWeek when applying a new date range - this is used for week range selection
        setInitialWeek(null);

        if (onChange && tempDateRange[0] && tempDateRange[1]) {
            onChange([tempDateRange[0], tempDateRange[1]]);
        }
        setIsOpen(false);
    };

    const handlePresetSelect = (preset: DateRangePreset) => {
        const newRange = preset.getValue();
        setTempDateRange(newRange);
        setTempSelectedPreset(preset);
    };

    const handleDateRangeChange = useCallback((newRange: DateRange) => {
        if (!Array.isArray(newRange)) {
            return;
        }
        setTempDateRange(newRange);
        setTempSelectedPreset(null);
    }, []);

    const reset = () => {
        setDateRange(value);
        setSelectedPreset(null);
    };

    const calendarConfig: CalendarVisualizationType = useMemo(() => {
        switch (timeInterval) {
            case TimeFrames.YEAR:
                return {
                    type: TimeFrames.YEAR,
                    props: {
                        type: 'range',
                        value: tempDateRange,
                        onChange: (dates) => {
                            if (!Array.isArray(dates)) return;
                            const startDate = dates[0]
                                ? dayjs(dates[0]).startOf('year').toDate()
                                : null;
                            const endDate = dates[1]
                                ? dayjs(dates[1]).endOf('year').toDate()
                                : null;
                            handleDateRangeChange([startDate, endDate]);
                        },
                        numberOfColumns: 2,
                        styles: getCommonCalendarStyles,
                    },
                } satisfies YearPickerConfig;
            case TimeFrames.MONTH:
                return {
                    type: TimeFrames.MONTH,
                    props: {
                        type: 'range',
                        value: tempDateRange,
                        onChange: (dates) => {
                            if (!Array.isArray(dates)) return;
                            const startDate = dates[0]
                                ? dayjs(dates[0]).startOf('month').toDate()
                                : null;
                            const endDate = dates[1]
                                ? dayjs(dates[1]).endOf('month').toDate()
                                : null;
                            handleDateRangeChange([startDate, endDate]);
                        },
                        numberOfColumns: 2,
                        styles: getCommonCalendarStyles,
                    },
                } satisfies MonthPickerConfig;
            case TimeFrames.WEEK:
                return {
                    type: TimeFrames.WEEK,
                    props: {
                        type: 'range',
                        value: tempDateRange,
                        onChange: (dates) => {
                            if (!Array.isArray(dates)) return;

                            const getWeekBoundaries = (date: Date) => {
                                const weekStart = dayjs(date)
                                    .startOf('isoWeek')
                                    .toDate();
                                const weekEnd = dayjs(date)
                                    .endOf('isoWeek')
                                    .toDate();
                                return { weekStart, weekEnd };
                            };

                            // If we're starting a new selection and already had a complete range
                            if (
                                dates[0] &&
                                !dates[1] &&
                                tempDateRange[0] &&
                                tempDateRange[1]
                            ) {
                                setInitialWeek(null); // Clear initialWeek when starting a new selection
                            }

                            // Start of a new range selection
                            if (dates[0] && !dates[1]) {
                                const { weekStart, weekEnd } =
                                    getWeekBoundaries(dates[0]);
                                if (!initialWeek) {
                                    // Store the start of the week to use as the initial week so we can use it for the next selection
                                    setInitialWeek(weekStart);
                                    handleDateRangeChange([weekStart, weekEnd]);
                                } else {
                                    handleDateRangeChange([
                                        initialWeek,
                                        weekEnd,
                                    ]);
                                }
                            }
                            // Complete range selection
                            else if (dates[0] && dates[1]) {
                                const endWeek = getWeekBoundaries(dates[1]);
                                if (initialWeek) {
                                    handleDateRangeChange([
                                        initialWeek,
                                        endWeek.weekEnd,
                                    ]);
                                } else {
                                    const startWeek = getWeekBoundaries(
                                        dates[0],
                                    );
                                    handleDateRangeChange([
                                        startWeek.weekStart,
                                        endWeek.weekEnd,
                                    ]);
                                }
                            }
                        },
                        numberOfColumns: 2,
                        firstDayOfWeek: 1,
                        hideOutsideDates: true,
                        // Highlight the week of the selected date
                        getDayProps: (date) => {
                            const today = dayjs().endOf('day');
                            const isInFuture = dayjs(date).isAfter(today);

                            const isSelected = Boolean(
                                tempDateRange[0] &&
                                    tempDateRange[1] &&
                                    date >=
                                        dayjs(tempDateRange[0])
                                            .startOf('isoWeek')
                                            .toDate() &&
                                    date <=
                                        dayjs(tempDateRange[1])
                                            .endOf('isoWeek')
                                            .toDate() &&
                                    !isInFuture, // Don't highlight future dates
                            );

                            return {
                                inRange: isSelected,
                                firstInRange: date.getDay() === 1 && isSelected,
                                lastInRange: date.getDay() === 0 && isSelected,
                            };
                        },
                        styles: getCommonCalendarStyles,
                    },
                } satisfies WeekPickerConfig;
            case TimeFrames.DAY:
                return {
                    type: TimeFrames.DAY,
                    props: {
                        type: 'range',
                        value: tempDateRange,
                        onChange: handleDateRangeChange,
                        numberOfColumns: 2,
                        styles: getCommonCalendarStyles,
                    },
                } satisfies DayPickerConfig;
            default:
                assertUnimplementedTimeframe(timeInterval);
        }
    }, [timeInterval, tempDateRange, handleDateRangeChange, initialWeek]);

    return {
        isOpen,
        tempDateRange,
        selectedPreset,
        tempSelectedPreset,
        presets,
        buttonLabel,
        formattedTempDateRange,
        handleOpen,
        handleApply,
        handlePresetSelect,
        handleDateRangeChange,
        calendarConfig,
        reset,
    };
};
