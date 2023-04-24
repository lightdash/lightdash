import { NumberInput } from '@mantine/core';
import moment from 'moment';
import { FC } from 'react';

type Props = {
    value: Date;
    onChange: (value: Date) => void;
    disabled?: boolean;
};

const YearInput: FC<Props> = ({ value, onChange, disabled }) => {
    const utcYearValue = moment(value).year();

    return (
        <NumberInput
            disabled={disabled}
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
