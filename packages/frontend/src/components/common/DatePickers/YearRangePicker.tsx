import { YearPicker, type YearPickerProps } from '@mantine-8/dates';
import { useCallback, type FC } from 'react';
import {
    formatMantineDateRange,
    parseMantineDateRange,
    type MantineDateRange,
} from '../Filters/FilterInputs/mantineDateAdapter';
import { type CalendarDateRange } from './types';

export type YearRangePickerProps = Omit<
    YearPickerProps<'range'>,
    'type' | 'value' | 'defaultValue' | 'onChange' | 'minDate' | 'maxDate'
> & {
    value: CalendarDateRange;
    onChange: (value: CalendarDateRange) => void;
};

// Date-native year range picker; Mantine v8's date-string contract stays private
const YearRangePicker: FC<YearRangePickerProps> = ({
    value,
    onChange,
    ...rest
}) => {
    const handleChange = useCallback(
        (range: MantineDateRange) => onChange(parseMantineDateRange(range)),
        [onChange],
    );

    return (
        <YearPicker
            {...rest}
            type="range"
            value={formatMantineDateRange(value)}
            onChange={handleChange}
        />
    );
};

export default YearRangePicker;
