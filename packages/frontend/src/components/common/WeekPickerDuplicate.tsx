import { WeekDay } from '@lightdash/common';
import { DateInput, DateInputProps, DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';
import { FC, useMemo, useState } from 'react';

//
// date input accepts start of the week day
// prop is firstDayOfWeek: number 0-6
// 0 – Sunday, 6 – Saturday, defaults to 1 – Monday
// our internal WeekDay enum is a range from 0 (Monday) to 6 (Sunday)
//

const convertWeekDayToDayOfWeek = (weekDay: WeekDay): DayOfWeek => {
    const converted = weekDay + 1;
    return (converted <= 6 ? converted : 0) as DayOfWeek;
};

const startOfWeek = (date: Date, startOfWeekDay: WeekDay) => {
    return dayjs(date)
        .locale('custom', { weekStart: startOfWeekDay })
        .startOf('week')
        .toDate();
};

const endOfWeek = (date: Date, weekDay: WeekDay) => {
    return dayjs(date)
        .locale('custom', { weekStart: weekDay })
        .endOf('week')
        .toDate();
};

const isInWeekRange = (date: Date, value: Date | null, weekDay: WeekDay) => {
    if (!value) return false;
    const startOfWeekDate = startOfWeek(value, weekDay);
    const endOfWeekDate = endOfWeek(value, weekDay);

    return (
        (dayjs(date).isSame(startOfWeekDate) ||
            dayjs(date).isAfter(startOfWeekDate)) &&
        (dayjs(date).isSame(endOfWeekDate) ||
            dayjs(date).isBefore(endOfWeekDate))
    );
};

interface Props
    extends Omit<DateInputProps, 'firstDayOfWeek' | 'value' | 'onChange'> {
    value: unknown;
    onChange: (value: Date) => void;
    startOfWeekDay?: WeekDay;
}

const WeekPicker: FC<Props> = ({
    startOfWeekDay = WeekDay.SUNDAY,
    value: stringOrDateValue,
    onChange,
    ...rest
}) => {
    const [hoveredDate, setHoveredDate] = useState<Date>();
    const dateValue = useMemo(() => {
        if (!stringOrDateValue) return null;

        if (typeof stringOrDateValue === 'string') {
            return new Date(stringOrDateValue);
        } else if (stringOrDateValue instanceof Date) {
            return stringOrDateValue;
        } else {
            throw new Error(
                `Invalid date value: ${stringOrDateValue} (${typeof stringOrDateValue})`,
            );
        }
    }, [stringOrDateValue]);

    const convertedStartOfWeekDay = convertWeekDayToDayOfWeek(startOfWeekDay);

    const currentStartOfWeek = useMemo(() => {
        if (!dateValue) return null;
        return startOfWeek(dateValue, convertedStartOfWeekDay);
    }, [dateValue, convertedStartOfWeekDay]);

    return (
        <DateInput
            size="xs"
            sx={{ flex: 1, minWidth: '130px' }}
            popoverProps={{ shadow: 'sm' }}
            getDayProps={(date) => {
                const isHovered = hoveredDate
                    ? isInWeekRange(date, hoveredDate, convertedStartOfWeekDay)
                    : false;
                const isSelected = currentStartOfWeek
                    ? isInWeekRange(
                          date,
                          currentStartOfWeek,
                          convertedStartOfWeekDay,
                      )
                    : false;

                const isInRange = isHovered || isSelected;

                return {
                    onMouseEnter: () => setHoveredDate(date),
                    onMouseLeave: () => setHoveredDate(undefined),
                    inRange: isInRange,
                    firstInRange:
                        isInRange &&
                        date.getDate() ===
                            startOfWeek(
                                date,
                                convertedStartOfWeekDay,
                            ).getDate(),
                    lastInRange:
                        isInRange &&
                        date.getDate() ===
                            endOfWeek(date, convertedStartOfWeekDay).getDate(),
                    selected: isSelected,
                };
            }}
            {...rest}
            firstDayOfWeek={convertedStartOfWeekDay}
            value={dateValue}
            onChange={(date) => {
                if (!date) return;
                onChange(startOfWeek(date, convertedStartOfWeekDay));
            }}
        />
    );
};

export default WeekPicker;
