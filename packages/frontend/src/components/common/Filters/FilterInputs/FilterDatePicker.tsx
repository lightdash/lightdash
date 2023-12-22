import { DateInput, DateInputProps, DayOfWeek } from '@mantine/dates';
import { FC } from 'react';

interface Props
    extends Omit<
        DateInputProps,
        'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
    > {
    value: Date | null;
    onChange: (value: Date) => void;
    firstDayOfWeek: DayOfWeek;
}

const FilterDatePicker: FC<React.PropsWithChildren<Props>> = ({
    value,
    onChange,
    firstDayOfWeek,
    ...rest
}) => {
    return (
        <DateInput
            w="100%"
            size="xs"
            {...rest}
            popoverProps={{ shadow: 'sm', ...rest.popoverProps }}
            firstDayOfWeek={firstDayOfWeek}
            value={value}
            onChange={(date) => {
                if (!date) return;
                onChange(date);
            }}
        />
    );
};

export default FilterDatePicker;
