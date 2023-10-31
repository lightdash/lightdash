import { DateTimePicker, DateTimePickerProps, DayOfWeek } from '@mantine/dates';
import { FC } from 'react';

interface Props
    extends Omit<
        DateTimePickerProps,
        'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
    > {
    value: Date | null;
    onChange: (value: Date) => void;
    firstDayOfWeek: DayOfWeek;
}

const FilterDateTimePicker: FC<Props> = ({
    value,
    onChange,
    firstDayOfWeek,
    ...rest
}) => {
    return (
        <DateTimePicker
            w="100%"
            size="xs"
            {...rest}
            popoverProps={{ ...rest.popoverProps, shadow: 'sm' }}
            firstDayOfWeek={firstDayOfWeek}
            value={value}
            onChange={(date) => {
                if (!date) return;
                onChange(date);
            }}
        />
    );
};

export default FilterDateTimePicker;
