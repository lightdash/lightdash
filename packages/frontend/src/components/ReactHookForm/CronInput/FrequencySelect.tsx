import { Select } from '@mantine/core';
import React, { type FC } from 'react';
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
            withinPortal
            disabled={disabled}
            onChange={onChange}
            w={110}
            sx={{ alignSelf: 'start' }}
        />
    );
};
export default FrequencySelect;
