import {
    DateInput,
    DatePicker,
    type DateInputProps,
    type DayOfWeek,
} from '@mantine/dates';
import { type FC } from 'react';
import InvalidDateInput from './InvalidDateInput';

interface Props extends Omit<
    DateInputProps,
    'firstDayOfWeek' | 'getDayProps' | 'value' | 'onChange'
> {
    value: Date | null;
    onChange: (value: Date) => void;
    firstDayOfWeek: DayOfWeek;
    invalidValue?: string;
}

const FilterDatePicker: FC<Props> = ({
    value,
    onChange,
    firstDayOfWeek,
    invalidValue,
    ...rest
}) => {
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
                        minDate={rest.minDate}
                        maxDate={rest.maxDate}
                        value={null}
                        onChange={(date) => {
                            if (!date) return;
                            onChange(date);
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
