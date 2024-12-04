import {
    TimeFrames,
    type MetricExplorerDateRange,
    type MetricExplorerPartialDateRange,
} from '@lightdash/common';
import {
    type DatePickerProps,
    type MonthPickerProps,
    type YearPickerProps,
} from '@mantine/dates';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, getDateRangePresets } from '../utils/metricPeekDate';

type DateRange = MetricExplorerPartialDateRange;

export interface DateRangePreset {
    label: string;
    getValue: () => DateRange;
    getTooltipLabel: () => string;
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
    | YearPickerConfig;

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
                                    .startOf('week')
                                    .toDate();
                                const weekEnd = dayjs(date)
                                    .endOf('week')
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
                        firstDayOfWeek: 0,
                        hideOutsideDates: true,
                        // Highlight the week of the selected date
                        getDayProps: (date) => {
                            const isSelected = Boolean(
                                tempDateRange[0] &&
                                    tempDateRange[1] &&
                                    date >=
                                        dayjs(tempDateRange[0])
                                            .startOf('week')
                                            .toDate() &&
                                    date <=
                                        dayjs(tempDateRange[1])
                                            .endOf('week')
                                            .toDate(),
                            );
                            return {
                                selected: isSelected,
                                inRange: isSelected,
                                firstInRange: date.getDay() === 0 && isSelected, // Highlight the first day of the week
                                lastInRange: date.getDay() === 6 && isSelected, // Highlight the last day of the week
                            };
                        },
                    },
                } satisfies WeekPickerConfig;
            case TimeFrames.DAY:
            default:
                return {
                    type: TimeFrames.DAY,
                    props: {
                        type: 'range',
                        value: tempDateRange,
                        onChange: handleDateRangeChange,
                        numberOfColumns: 2,
                    },
                } satisfies DayPickerConfig;
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
