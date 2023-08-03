import { MonthPickerInput, MonthPickerInputProps } from '@mantine/dates';
import moment from 'moment';
import { FC } from 'react';

type Props = {
    value: Date | null;
    onChange: (value: Date) => void;
} & Pick<MonthPickerInputProps, 'disabled' | 'placeholder'>;

const MonthAndYearInput: FC<Props> = ({
    value,
    onChange,
    disabled,
    placeholder,
}) => {
    const yearValue = value ? moment(value).toDate() : null;

    return (
        <MonthPickerInput
            size="xs"
            popoverProps={{
                withArrow: true,
                withinPortal: false,
                shadow: 'md',
            }}
            disabled={disabled}
            placeholder={placeholder}
            value={yearValue}
            onChange={(date) => {
                if (!date) return;
                onChange(date);
            }}
        />
    );
};

export default MonthAndYearInput;
