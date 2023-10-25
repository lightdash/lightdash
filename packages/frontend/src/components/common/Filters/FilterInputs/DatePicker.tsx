import { WeekDay } from '@lightdash/common';
import { DateInput, DateInputProps } from '@mantine/dates';
import { FC, useMemo } from 'react';
import { getDateValueFromUnknown, normalizeWeekDay } from './dateUtils';

interface Props
    extends Omit<
        DateInputProps,
        'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
    > {
    value: unknown;
    onChange: (value: Date) => void;
    startOfWeek?: WeekDay;
}

const DatePicker: FC<Props> = ({
    startOfWeek: startOfWeekDay = WeekDay.SUNDAY,
    value: stringOrDateValue,
    onChange,
    ...rest
}) => {
    const dateValue = useMemo(
        () => getDateValueFromUnknown(stringOrDateValue),
        [stringOrDateValue],
    );

    const normalizedStartOfWeekDay = useMemo(
        () => normalizeWeekDay(startOfWeekDay),
        [startOfWeekDay],
    );

    return (
        <DateInput
            w="100%"
            size="xs"
            {...rest}
            popoverProps={{ ...rest.popoverProps, shadow: 'sm' }}
            firstDayOfWeek={normalizedStartOfWeekDay}
            value={dateValue}
            onChange={(date) => {
                if (!date) return;
                onChange(date);
            }}
        />
    );
};

export default DatePicker;
