import { Select } from '@mantine/core';
import React, { FC } from 'react';
import { Frequency } from './cronInputUtils';

type FrequencyItem = {
    value: Frequency;
    label: string;
};

const FrequencyItems: Array<FrequencyItem> = [
    {
        value: Frequency.HOURLY,
        label: 'Hourly',
    },
    {
        value: Frequency.DAILY,
        label: 'Daily',
    },
    {
        value: Frequency.WEEKLY,
        label: 'Weekly',
    },
    {
        value: Frequency.MONTHLY,
        label: 'Monthly',
    },
    {
        value: Frequency.CUSTOM,
        label: 'Custom',
    },
];

const FrequencySelect: FC<{
    disabled?: boolean;
    value: Frequency;
    onChange: (value: Frequency) => void;
}> = ({ disabled, value, onChange }) => {
    return (
        <Select
            data={FrequencyItems}
            value={value}
            disabled={disabled}
            onChange={onChange}
        />
    );
};
export default FrequencySelect;
