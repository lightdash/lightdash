import { DatePickerInput, type DatePickerInputProps } from '@mantine-8/dates';
import { useCallback, type FC } from 'react';
import {
    formatMantineDate,
    formatMantineDateRange,
    parseMantineDateRange,
    type MantineDateRange,
} from '../Filters/FilterInputs/mantineDateAdapter';
import { type CalendarDateRange } from './types';

type Props = Omit<
    DatePickerInputProps<'range'>,
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
    value: CalendarDateRange;
    onChange: (value: CalendarDateRange) => void;
    minDate?: Date;
    maxDate?: Date;
};

// Date-native range picker input; Mantine v8's date-string contract stays private
const CalendarRangePickerInput: FC<Props> = ({
    value,
    onChange,
    minDate,
    maxDate,
    ...rest
}) => {
    const handleChange = useCallback(
        (range: MantineDateRange) => onChange(parseMantineDateRange(range)),
        [onChange],
    );

    return (
        <DatePickerInput
            {...rest}
            type="range"
            minDate={formatMantineDate(minDate ?? null) ?? undefined}
            maxDate={formatMantineDate(maxDate ?? null) ?? undefined}
            value={formatMantineDateRange(value)}
            onChange={handleChange}
        />
    );
};

export default CalendarRangePickerInput;
