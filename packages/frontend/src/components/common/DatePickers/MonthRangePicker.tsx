import { MonthPicker, type MonthPickerProps } from '@mantine-8/dates';
import { useCallback, type FC } from 'react';
import {
    formatMantineDateRange,
    parseMantineDateRange,
    type MantineDateRange,
} from '../Filters/FilterInputs/mantineDateAdapter';
import { type CalendarDateRange } from './types';

export type MonthRangePickerProps = Omit<
    MonthPickerProps<'range'>,
    'type' | 'value' | 'defaultValue' | 'onChange' | 'minDate' | 'maxDate'
> & {
    value: CalendarDateRange;
    onChange: (value: CalendarDateRange) => void;
};

// Date-native month range picker; Mantine v8's date-string contract stays private
const MonthRangePicker: FC<MonthRangePickerProps> = ({
    value,
    onChange,
    ...rest
}) => {
    const handleChange = useCallback(
        (range: MantineDateRange) => onChange(parseMantineDateRange(range)),
        [onChange],
    );

    return (
        <MonthPicker
            {...rest}
            type="range"
            value={formatMantineDateRange(value)}
            onChange={handleChange}
        />
    );
};

export default MonthRangePicker;
