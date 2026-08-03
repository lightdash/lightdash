import {
    DateInput,
    DatePicker,
    type DateInputProps,
    type DayOfWeek,
} from '@mantine-8/dates';
import { type FC } from 'react';
import InvalidDateInput from './InvalidDateInput';
import { formatMantineDate, parseMantineDate } from './mantineDateAdapter';

interface Props extends Omit<
    DateInputProps,
    | 'firstDayOfWeek'
    | 'getDayProps'
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

const FilterDatePicker: FC<Props> = ({
    value,
    onChange,
    firstDayOfWeek,
    invalidValue,
    minDate,
    maxDate,
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
                        minDate={
                            formatMantineDate(minDate ?? null) ?? undefined
                        }
                        maxDate={
                            formatMantineDate(maxDate ?? null) ?? undefined
                        }
                        value={null}
                        onChange={(mantineValue) => {
                            const date = parseMantineDate(mantineValue);
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
            minDate={formatMantineDate(minDate ?? null) ?? undefined}
            maxDate={formatMantineDate(maxDate ?? null) ?? undefined}
            value={formatMantineDate(value)}
            onChange={(mantineValue) => {
                const date = parseMantineDate(mantineValue);
                if (!date) return;
                onChange(date);
            }}
        />
    );
};

export default FilterDatePicker;
