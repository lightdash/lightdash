import { NumberInput, NumberInputProps } from '@mantine/core';
import moment from 'moment';
import { FC } from 'react';

interface YearInputProps extends Omit<NumberInputProps, 'value' | 'onChange'> {
    value: Date;
    onChange: (value: Date) => void;
}

const YearInput: FC<YearInputProps> = ({ value, onChange, ...rest }) => {
    const utcYearValue = moment(value).year();

    return (
        <NumberInput
            {...rest}
            placeholder="Enter year"
            min={1000}
            max={9999}
            defaultValue={utcYearValue}
            onChange={(year) => {
                if (year === '') return;
                onChange(moment(value).year(year).toDate());
            }}
        />
    );
};

export default YearInput;
