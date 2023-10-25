import { WeekDay } from '@lightdash/common';
import { DateInput, DateInputProps } from '@mantine/dates';
import { FC, useMemo, useState } from 'react';
import {
    endOfWeek,
    getDateValueFromUnknown,
    isInWeekRange,
    normalizeWeekDay,
    startOfWeek,
} from './Filters/FilterInputs/dateUtils';

interface Props
    extends Omit<
        DateInputProps,
        'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
    > {
    value: unknown;
    onChange: (value: Date) => void;
    startOfWeek?: WeekDay;
}

const WeekPicker: FC<Props> = ({
    startOfWeek: startOfWeekDay = WeekDay.SUNDAY,
    value: stringOrDateValue,
    onChange,
    ...rest
}) => {
    const [hoveredDate, setHoveredDate] = useState<Date>();

    const dateValue = useMemo(
        () => getDateValueFromUnknown(stringOrDateValue),
        [stringOrDateValue],
    );

    const convertedStartOfWeekDay = useMemo(
        () => normalizeWeekDay(startOfWeekDay),
        [startOfWeekDay],
    );

    const currentStartOfWeek = useMemo(() => {
        if (!dateValue) return null;
        return startOfWeek(dateValue, convertedStartOfWeekDay);
    }, [dateValue, convertedStartOfWeekDay]);

    return (
        <DateInput
            w="100%"
            size="xs"
            {...rest}
            popoverProps={{ ...rest.popoverProps, shadow: 'sm' }}
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
