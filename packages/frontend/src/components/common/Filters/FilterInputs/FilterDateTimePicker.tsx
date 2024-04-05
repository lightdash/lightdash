import { Text } from '@mantine/core';
import {
    DateTimePicker,
    type DateTimePickerProps,
    type DayOfWeek,
} from '@mantine/dates';
import { type FC } from 'react';

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
        // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
        // @ts-ignore
        <DateTimePicker
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
            inputWrapperOrder={['input', 'description']}
            description={<Text ml="two">UTC time: {value?.toUTCString()}</Text>}
        />
    );
};

export default FilterDateTimePicker;
