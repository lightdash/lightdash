import { WeekDay } from '@lightdash/common';
import { DateInput, DateInputProps } from '@mantine/dates';
import dayjs from 'dayjs';
import { FC, useMemo, useState } from 'react';
import {
    endOfWeek,
    getDateValueFromUnknown,
    isInWeekRange,
    startOfWeek,
} from './Filters/FilterInputs/dateUtils';

interface Props
    extends Omit<
        DateInputProps,
        'getDayProps' | 'firstDayOfWeek' | 'value' | 'onChange'
    > {
    value: unknown;
    onChange: (value: Date) => void;
    firstDayOfWeek: WeekDay;
}

const WeekPicker: FC<Props> = ({
    firstDayOfWeek,
    value: dateValue,
    onChange,
    ...rest
}) => {
    const [hoveredDate, setHoveredDate] = useState<Date>();

    const selectedDate = useMemo(() => {
        return getDateValueFromUnknown(dateValue);
    }, [dateValue]);

    return (
        <DateInput
            w="100%"
            size="xs"
            {...rest}
            popoverProps={{ ...rest.popoverProps, shadow: 'sm' }}
            getDayProps={(date) => {
                const isHovered = isInWeekRange(
                    date,
                    hoveredDate,
                    firstDayOfWeek,
                );
                const isSelected = isInWeekRange(
                    date,
                    selectedDate,
                    firstDayOfWeek,
                );
                const isInRange = isHovered || isSelected;

                return {
                    onMouseEnter: () => setHoveredDate(date),
                    onMouseLeave: () => setHoveredDate(undefined),
                    inRange: isInRange,
                    firstInRange: isInRange
                        ? dayjs(startOfWeek(date, firstDayOfWeek)).isSame(date)
                        : false,
                    lastInRange: isInRange
                        ? dayjs(endOfWeek(date, firstDayOfWeek)).isSame(date)
                        : false,
                    selected: isSelected,
                };
            }}
            firstDayOfWeek={firstDayOfWeek}
            value={selectedDate}
            onChange={(date) => {
                if (date) {
                    onChange(startOfWeek(date, firstDayOfWeek));
                }
            }}
        />
    );
};

export default WeekPicker;
