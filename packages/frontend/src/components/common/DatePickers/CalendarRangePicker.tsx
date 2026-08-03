import { DatePicker, type DatePickerProps } from '@mantine-8/dates';
import { useCallback, type FC } from 'react';
import {
    formatMantineDate,
    formatMantineDateRange,
    parseMantineDate,
    parseMantineDateRange,
    type MantineDateRange,
} from '../Filters/FilterInputs/mantineDateAdapter';
import { type CalendarDateRange } from './types';

type MantineGetDayProps = NonNullable<DatePickerProps<'range'>['getDayProps']>;

export type CalendarRangePickerProps = Omit<
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
    getDayProps?: (date: Date) => ReturnType<MantineGetDayProps>;
};

// Date-native inline range calendar; Mantine v8's date-string contract stays private
const CalendarRangePicker: FC<CalendarRangePickerProps> = ({
    value,
    onChange,
    minDate,
    maxDate,
    defaultDate,
    getDayProps,
    ...rest
}) => {
    const handleChange = useCallback(
        (range: MantineDateRange) => onChange(parseMantineDateRange(range)),
        [onChange],
    );

    const handleGetDayProps = useCallback<MantineGetDayProps>(
        (dateString) => {
            const date = parseMantineDate(dateString);
            return date && getDayProps ? getDayProps(date) : {};
        },
        [getDayProps],
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
            getDayProps={getDayProps ? handleGetDayProps : undefined}
        />
    );
};

export default CalendarRangePicker;
