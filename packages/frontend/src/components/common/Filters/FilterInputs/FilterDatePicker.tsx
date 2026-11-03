import {
    DateInput,
    DatePicker,
    type DateInputProps,
    type DayOfWeek,
} from '@mantine/dates';
import { type FC } from 'react';
import InvalidDateInput from './InvalidDateInput';
import { formatMantineDate, parseMantineDate } from './mantineDateAdapter';
import { useDateInputEscape } from './useDateInputEscape';

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
    const escapeProps = useDateInputEscape(rest.popoverProps, rest.onKeyDown);
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
                        __stopPropagation
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
            {...escapeProps}
            popoverProps={{ shadow: 'sm', ...escapeProps.popoverProps }}
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
