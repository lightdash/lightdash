import { DatePicker, type DatePickerProps } from '@mantine-8/dates';
import { useCallback, type FC } from 'react';
import {
    formatMantineDate,
    formatMantineDateRange,
    parseMantineDateRange,
    type MantineDateRange,
} from '../Filters/FilterInputs/mantineDateAdapter';
import { type CalendarDateRange } from './types';

type Props = Omit<
    DatePickerProps<'range'>,
    | 'type'
    | 'value'
    | 'defaultValue'
    | 'onChange'
    | 'minDate'
    | 'maxDate'
    | 'date'
    | 'defaultDate'
    | 'onDateChange'
    | 'getDayProps'
    | 'excludeDate'
    | 'renderDay'
> & {
    value: CalendarDateRange;
    onChange: (value: CalendarDateRange) => void;
    minDate?: Date;
    maxDate?: Date;
    defaultDate?: Date;
};

// Date-native inline range calendar; Mantine v8's date-string contract stays private
const CalendarRangePicker: FC<Props> = ({
    value,
    onChange,
    minDate,
    maxDate,
    defaultDate,
    ...rest
}) => {
    const handleChange = useCallback(
        (range: MantineDateRange) => onChange(parseMantineDateRange(range)),
        [onChange],
    );

    return (
        <DatePicker
            {...rest}
            type="range"
            minDate={formatMantineDate(minDate ?? null) ?? undefined}
            maxDate={formatMantineDate(maxDate ?? null) ?? undefined}
            defaultDate={formatMantineDate(defaultDate ?? null) ?? undefined}
            value={formatMantineDateRange(value)}
            onChange={handleChange}
        />
    );
};

export default CalendarRangePicker;
