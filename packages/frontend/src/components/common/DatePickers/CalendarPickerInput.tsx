import { DatePickerInput, type DatePickerInputProps } from '@mantine-8/dates';
import { useCallback, type FC } from 'react';
import {
    formatMantineDate,
    parseMantineDate,
} from '../Filters/FilterInputs/mantineDateAdapter';

export type CalendarPickerInputProps = Omit<
    DatePickerInputProps<'default'>,
    | 'type'
    | 'value'
    | 'defaultValue'
    | 'onChange'
    | 'minDate'
    | 'maxDate'
    | 'getDayProps'
    | 'excludeDate'
    | 'renderDay'
> & {
    value: Date | null;
    onChange: (value: Date | null) => void;
    minDate?: Date;
    maxDate?: Date;
};

// Date-native single date picker input; null onChange means the value was cleared
const CalendarPickerInput: FC<CalendarPickerInputProps> = ({
    value,
    onChange,
    minDate,
    maxDate,
    ...rest
}) => {
    const handleChange = useCallback(
        (mantineValue: string | null) => {
            if (mantineValue === null) {
                onChange(null);
                return;
            }
            const date = parseMantineDate(mantineValue);
            if (date) onChange(date);
        },
        [onChange],
    );

    return (
        <DatePickerInput
            {...rest}
            minDate={formatMantineDate(minDate ?? null) ?? undefined}
            maxDate={formatMantineDate(maxDate ?? null) ?? undefined}
            value={formatMantineDate(value)}
            onChange={handleChange}
        />
    );
};

export default CalendarPickerInput;
