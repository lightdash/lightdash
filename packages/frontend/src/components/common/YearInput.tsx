import { YearPickerInput, YearPickerInputProps } from '@mantine/dates';
import moment from 'moment';
import { FC } from 'react';

type Props = {
    value: Date | null;
    onChange: (value: Date) => void;
} & Pick<YearPickerInputProps, 'disabled' | 'placeholder'>;

const YearInput: FC<Props> = ({ value, onChange, disabled, placeholder }) => {
    return (
        <YearPickerInput
            className={disabled ? 'disabled-filter' : ''}
            disabled={disabled}
            placeholder={placeholder}
            maxDate={moment().year(9999).toDate()}
            minDate={moment().year(1000).toDate()}
            value={value === null ? undefined : new Date(value)}
            onChange={(year) => {
                if (year === null) return;
                onChange(year);
            }}
        />
    );
};

export default YearInput;
