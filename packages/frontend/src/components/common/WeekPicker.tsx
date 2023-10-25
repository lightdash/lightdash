import { WeekDay } from '@lightdash/common';
import { DateInput, DateInputProps } from '@mantine/dates';
import { FC, useMemo, useState } from 'react';
import {
    convertWeekDayToDayOfWeek,
    endOfWeek,
    isInWeekRange,
    startOfWeek,
} from './Filters/FilterInputs/dateUtils';

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
