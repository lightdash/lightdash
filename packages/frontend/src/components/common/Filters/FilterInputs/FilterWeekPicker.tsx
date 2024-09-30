import { DateInput, type DateInputProps, type DayOfWeek } from '@mantine/dates';
import dayjs from 'dayjs';
import { useState, type FC } from 'react';
import {
    endOfWeek,
    isInWeekRange,
    startOfWeek,
} from '../utils/filterDateUtils';

interface Props
    extends Omit<
        DateInputProps,
        'getDayProps' | 'firstDayOfWeek' | 'value' | 'onChange'
    > {
    value: Date | null;
    onChange: (value: Date) => void;
    firstDayOfWeek: DayOfWeek;
}

const FilterWeekPicker: FC<Props> = ({
    firstDayOfWeek,
    value,
    onChange,
    ...rest
}) => {
    const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

    return (
        <DateInput
            w="100%"
            size="xs"
            {...rest}
            popoverProps={{ shadow: 'sm', ...rest.popoverProps }}
            getDayProps={(date) => {
                const isHovered = isInWeekRange(
                    date,
                    hoveredDate,
                    firstDayOfWeek,
                );
                const isSelected = isInWeekRange(date, value, firstDayOfWeek);
                const isInRange = isHovered || isSelected;

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
            }}
            firstDayOfWeek={firstDayOfWeek}
            value={value}
            onChange={(date) => {
                if (date) {
                    onChange(startOfWeek(date, firstDayOfWeek));
                }
            }}
        />
    );
};

export default FilterWeekPicker;
