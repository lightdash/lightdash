import { Select } from '@mantine-8/core';
import React, { type FC } from 'react';
import { Frequency } from './cronInputUtils';
import styles from './FrequencySelect.module.css';

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
    onChange: (value: Frequency | null | string) => void;
}> = ({ disabled, value, onChange }) => {
    return (
        <Select
            className={styles.select}
            data={FrequencyItems}
            value={value}
            disabled={disabled}
            onChange={onChange}
            w={110}
        />
    );
};
export default FrequencySelect;
