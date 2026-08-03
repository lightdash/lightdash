import {
    assertUnimplementedTimeframe,
    TimeFrames,
    type MetricExplorerDateRange,
    type MetricExplorerPartialDateRange,
} from '@lightdash/common';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type CalendarRangePickerProps } from '../../../components/common/DatePickers/CalendarRangePicker';
import { type MonthRangePickerProps } from '../../../components/common/DatePickers/MonthRangePicker';
import { type CalendarDateRange } from '../../../components/common/DatePickers/types';
import { type YearRangePickerProps } from '../../../components/common/DatePickers/YearRangePicker';
import { formatDate, getDateRangePresets } from '../utils/metricExploreDate';
import styles from './useDateRangePicker.module.css';

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

type DayPickerConfig = {
    type: TimeFrames.DAY;
    props: CalendarRangePickerProps;
};

type WeekPickerConfig = {
    type: TimeFrames.WEEK;
    props: CalendarRangePickerProps;
};

type MonthPickerConfig = {
    type: TimeFrames.MONTH;
    props: MonthRangePickerProps;
};

type YearPickerConfig = {
    type: TimeFrames.YEAR;
    props: YearRangePickerProps;
};

type CalendarVisualizationType =
    | DayPickerConfig
    | WeekPickerConfig
    | MonthPickerConfig
    | YearPickerConfig
    | undefined;

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
    }, [value]);

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
                        value: tempDateRange,
                        onChange: (dates: CalendarDateRange) => {
                            const startDate = dates[0]
                                ? dayjs(dates[0]).startOf('year').toDate()
                                : null;
                            const endDate = dates[1]
                                ? dayjs(dates[1]).endOf('year').toDate()
                                : null;
                            handleDateRangeChange([startDate, endDate]);
                        },
                        numberOfColumns: 2,
                        classNames: styles,
                    },
                } satisfies YearPickerConfig;
            case TimeFrames.MONTH:
                return {
                    type: TimeFrames.MONTH,
                    props: {
                        value: tempDateRange,
                        onChange: (dates: CalendarDateRange) => {
                            const startDate = dates[0]
                                ? dayjs(dates[0]).startOf('month').toDate()
                                : null;
                            const endDate = dates[1]
                                ? dayjs(dates[1]).endOf('month').toDate()
                                : null;
                            handleDateRangeChange([startDate, endDate]);
                        },
                        numberOfColumns: 2,
                        classNames: styles,
                    },
                } satisfies MonthPickerConfig;
            case TimeFrames.WEEK:
                return {
                    type: TimeFrames.WEEK,
                    props: {
                        value: tempDateRange,
                        onChange: (parsedRange: CalendarDateRange) => {
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
                                parsedRange[0] &&
                                !parsedRange[1] &&
                                tempDateRange[0] &&
                                tempDateRange[1]
                            ) {
                                setInitialWeek(null); // Clear initialWeek when starting a new selection
                            }

                            // Start of a new range selection
                            if (parsedRange[0] && !parsedRange[1]) {
                                const { weekStart, weekEnd } =
                                    getWeekBoundaries(parsedRange[0]);
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
                            else if (parsedRange[0] && parsedRange[1]) {
                                const endWeek = getWeekBoundaries(
                                    parsedRange[1],
                                );
                                if (initialWeek) {
                                    handleDateRangeChange([
                                        initialWeek,
                                        endWeek.weekEnd,
                                    ]);
                                } else {
                                    const startWeek = getWeekBoundaries(
                                        parsedRange[0],
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
                        getDayProps: (date: Date) => {
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
                        classNames: styles,
                    },
                } satisfies WeekPickerConfig;
            case TimeFrames.DAY:
                return {
                    type: TimeFrames.DAY,
                    props: {
                        value: tempDateRange,
                        onChange: handleDateRangeChange,
                        numberOfColumns: 2,
                        classNames: styles,
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
