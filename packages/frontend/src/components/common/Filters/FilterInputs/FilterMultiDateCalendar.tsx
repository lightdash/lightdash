import { assertUnreachable, TimeFrames } from '@lightdash/common';
import {
    DatePicker,
    MonthPicker,
    YearPicker,
    type DayOfWeek,
} from '@mantine/dates';
import dayjs from 'dayjs';
import { useState, type FC } from 'react';
import {
    endOfWeek,
    isInWeekRange,
    startOfWeek,
} from '../utils/filterDateUtils';
import {
    toggleTimeFrameValue,
    type MultiDateTimeFrame,
} from './FilterMultiDatePicker.utils';
import quarterClasses from './FilterQuarterPicker.module.css';
import { formatMantineDate, parseMantineDate } from './mantineDateAdapter';

type Props = {
    timeFrame: MultiDateTimeFrame;
    values: Date[];
    firstDayOfWeek: DayOfWeek;
    onChange: (values: Date[]) => void;
};

const QUARTER_MONTHS = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [9, 10, 11],
];

const getQuarterMonths = (month: number): number[] =>
    QUARTER_MONTHS.find((months) => months.includes(month)) ??
    QUARTER_MONTHS[0];

/**
 * Weeks have no multi-select calendar of their own, so days are selected one at
 * a time and snapped to the week they belong to.
 */
const MultiWeekCalendar: FC<Omit<Props, 'timeFrame'>> = ({
    values,
    firstDayOfWeek,
    onChange,
}) => {
    const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

    const getDayProps = (mantineValue: string) => {
        const date = parseMantineDate(mantineValue);
        if (!date) return {};

        const isSelected = values.some((value) =>
            isInWeekRange(date, value, firstDayOfWeek),
        );
        const isInRange =
            isSelected || isInWeekRange(date, hoveredDate, firstDayOfWeek);

        return {
            onMouseEnter: () => setHoveredDate(date),
            onMouseLeave: () => setHoveredDate(null),
            inRange: isInRange,
            firstInRange: isInRange
                ? dayjs(startOfWeek(date, firstDayOfWeek)).isSame(date)
                : false,
            lastInRange: isInRange
                ? dayjs(endOfWeek(date, firstDayOfWeek)).isSame(date)
                : false,
            selected: isSelected,
        };
    };

    return (
        <DatePicker
            firstDayOfWeek={firstDayOfWeek}
            defaultDate={formatMantineDate(values[0] ?? null) ?? undefined}
            value={null}
            getDayProps={getDayProps}
            onChange={(mantineValue) => {
                const date = parseMantineDate(mantineValue);
                if (!date) return;
                onChange(
                    toggleTimeFrameValue(
                        values,
                        date,
                        TimeFrames.WEEK,
                        firstDayOfWeek,
                    ),
                );
            }}
        />
    );
};

/**
 * Quarters are picked from a month calendar where every month of a quarter
 * highlights and toggles together.
 */
const MultiQuarterCalendar: FC<Omit<Props, 'timeFrame'>> = ({
    values,
    firstDayOfWeek,
    onChange,
}) => {
    const [hoveredMonth, setHoveredMonth] = useState<Date | null>(null);

    const getMonthControlProps = (mantineValue: string) => {
        const date = parseMantineDate(mantineValue);
        if (!date) return {};

        const isSelected = values.some(
            (value) =>
                value.getFullYear() === date.getFullYear() &&
                getQuarterMonths(value.getMonth()).includes(date.getMonth()),
        );
        const isHovered =
            !isSelected &&
            hoveredMonth !== null &&
            hoveredMonth.getFullYear() === date.getFullYear() &&
            getQuarterMonths(hoveredMonth.getMonth()).includes(date.getMonth());

        return {
            className: quarterClasses.monthControl,
            'data-quarter-selected': isSelected || undefined,
            'data-quarter-hovered': isHovered || undefined,
            onMouseEnter: () => setHoveredMonth(date),
            onMouseLeave: () => setHoveredMonth(null),
        };
    };

    return (
        <MonthPicker
            defaultDate={formatMantineDate(values[0] ?? null) ?? undefined}
            value={null}
            getMonthControlProps={getMonthControlProps}
            onMouseLeave={() => setHoveredMonth(null)}
            onChange={(mantineValue) => {
                const date = parseMantineDate(mantineValue);
                if (!date) return;
                onChange(
                    toggleTimeFrameValue(
                        values,
                        date,
                        TimeFrames.QUARTER,
                        firstDayOfWeek,
                    ),
                );
            }}
        />
    );
};

const FilterMultiDateCalendar: FC<Props> = ({
    timeFrame,
    values,
    firstDayOfWeek,
    onChange,
}) => {
    const mantineValues = values
        .map(formatMantineDate)
        .filter((value): value is string => value !== null);

    const handleChange = (nextValues: string[]) => {
        onChange(
            nextValues
                .map(parseMantineDate)
                .filter((date): date is Date => date !== null),
        );
    };

    switch (timeFrame) {
        case TimeFrames.DAY:
            return (
                <DatePicker
                    type="multiple"
                    firstDayOfWeek={firstDayOfWeek}
                    // open on the earliest selected date rather than today
                    defaultDate={mantineValues[0]}
                    value={mantineValues}
                    onChange={handleChange}
                />
            );
        case TimeFrames.WEEK:
            return (
                <MultiWeekCalendar
                    values={values}
                    firstDayOfWeek={firstDayOfWeek}
                    onChange={onChange}
                />
            );
        case TimeFrames.MONTH:
            return (
                <MonthPicker
                    type="multiple"
                    defaultDate={mantineValues[0]}
                    value={mantineValues}
                    onChange={handleChange}
                />
            );
        case TimeFrames.QUARTER:
            return (
                <MultiQuarterCalendar
                    values={values}
                    firstDayOfWeek={firstDayOfWeek}
                    onChange={onChange}
                />
            );
        case TimeFrames.YEAR:
            return (
                <YearPicker
                    type="multiple"
                    defaultDate={mantineValues[0]}
                    value={mantineValues}
                    onChange={handleChange}
                />
            );
        default:
            return assertUnreachable(timeFrame, 'Unknown date filter grain');
    }
};

export default FilterMultiDateCalendar;
