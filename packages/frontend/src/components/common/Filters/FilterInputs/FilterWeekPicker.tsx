import {
    DateInput,
    DatePicker,
    type DateInputProps,
    type DayOfWeek,
} from '@mantine-8/dates';
import dayjs from 'dayjs';
import { useState, type FC } from 'react';
import {
    endOfWeek,
    isInWeekRange,
    startOfWeek,
} from '../utils/filterDateUtils';
import InvalidDateInput from './InvalidDateInput';
import { formatMantineDate, parseMantineDate } from './mantineDateAdapter';

interface Props extends Omit<
    DateInputProps,
    | 'getDayProps'
    | 'firstDayOfWeek'
    | 'value'
    | 'defaultValue'
    | 'onChange'
    | 'minDate'
    | 'maxDate'
> {
    value: Date | null;
    onChange: (value: Date) => void;
    minDate?: Date;
    maxDate?: Date;
    firstDayOfWeek: DayOfWeek;
    invalidValue?: string;
}

const FilterWeekPicker: FC<Props> = ({
    firstDayOfWeek,
    value,
    onChange,
    invalidValue,
    minDate,
    maxDate,
    ...rest
}) => {
    const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
    const getDayProps = (mantineValue: string) => {
        const date = parseMantineDate(mantineValue);
        if (!date) return {};

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
    const handleChange = (mantineValue: string | null) => {
        const date = parseMantineDate(mantineValue);
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
                        minDate={
                            formatMantineDate(minDate ?? null) ?? undefined
                        }
                        maxDate={
                            formatMantineDate(maxDate ?? null) ?? undefined
                        }
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
            minDate={formatMantineDate(minDate ?? null) ?? undefined}
            maxDate={formatMantineDate(maxDate ?? null) ?? undefined}
            value={formatMantineDate(value)}
            onChange={handleChange}
        />
    );
};

export default FilterWeekPicker;
