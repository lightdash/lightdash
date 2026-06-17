import {
    DateInput,
    DatePicker,
    type DateInputProps,
    type DayOfWeek,
} from '@mantine/dates';
import dayjs from 'dayjs';
import { useState, type FC } from 'react';
import {
    endOfWeek,
    isInWeekRange,
    startOfWeek,
} from '../utils/filterDateUtils';
import InvalidDateInput from './InvalidDateInput';

interface Props extends Omit<
    DateInputProps,
    'getDayProps' | 'firstDayOfWeek' | 'value' | 'onChange'
> {
    value: Date | null;
    onChange: (value: Date) => void;
    firstDayOfWeek: DayOfWeek;
    invalidValue?: string;
}

const FilterWeekPicker: FC<Props> = ({
    firstDayOfWeek,
    value,
    onChange,
    invalidValue,
    ...rest
}) => {
    const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
    const getDayProps = (date: Date) => {
        const isHovered = isInWeekRange(date, hoveredDate, firstDayOfWeek);
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
    };
    const handleChange = (date: Date | null) => {
        if (date) {
            onChange(startOfWeek(date, firstDayOfWeek));
        }
    };

    if (invalidValue) {
        return (
            <InvalidDateInput
                value={invalidValue}
                disabled={rest.disabled}
                popoverProps={rest.popoverProps}
                autoFocus={rest.autoFocus}
            >
                {({ close }) => (
                    <DatePicker
                        firstDayOfWeek={firstDayOfWeek}
                        value={null}
                        getDayProps={getDayProps}
                        onChange={(date) => {
                            handleChange(date);
                            close();
                        }}
                    />
                )}
            </InvalidDateInput>
        );
    }

    return (
        <DateInput
            w="100%"
            size="xs"
            {...rest}
            popoverProps={{ shadow: 'sm', ...rest.popoverProps }}
            getDayProps={getDayProps}
            firstDayOfWeek={firstDayOfWeek}
            value={value}
            onChange={handleChange}
        />
    );
};

export default FilterWeekPicker;
