import {
    DateTimePicker as DateTimeInput,
    DateTimePickerProps,
    DayOfWeek,
} from '@mantine/dates';
import { FC, useMemo } from 'react';
import { getDateValueFromUnknown } from './dateUtils';

interface Props
    extends Omit<
        DateTimePickerProps,
        'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
    > {
    value: unknown;
    onChange: (value: Date) => void;
    firstDayOfWeek: DayOfWeek;
}

const DateTimePicker: FC<Props> = ({
    value: stringOrDateValue,
    onChange,
    firstDayOfWeek,
    ...rest
}) => {
    const dateValue = useMemo(
        () => getDateValueFromUnknown(stringOrDateValue),
        [stringOrDateValue],
    );

    return (
        <DateTimeInput
            w="100%"
            size="xs"
            {...rest}
            popoverProps={{ ...rest.popoverProps, shadow: 'sm' }}
            firstDayOfWeek={firstDayOfWeek}
            value={dateValue}
            onChange={(date) => {
                if (!date) return;
                onChange(date);
            }}
        />
    );
};

export default DateTimePicker;
