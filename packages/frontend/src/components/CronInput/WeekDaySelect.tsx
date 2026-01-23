import { Select } from '@mantine/core';
import React, { type FC } from 'react';

type Option = {
    value: string;
    label: string;
};

const Options: Array<Option> = [
    {
        value: '0',
        label: 'Sunday',
    },
    {
        value: '1',
        label: 'Monday',
    },
    {
        value: '2',
        label: 'Tuesday',
    },
    {
        value: '3',
        label: 'Wednesday',
    },
    {
        value: '4',
        label: 'Thursday',
    },
    {
        value: '5',
        label: 'Friday',
    },
    {
        value: '6',
        label: 'Saturday',
    },
];

const WeekDaySelect: FC<{
    disabled?: boolean;
    value: number;
    onChange: (value: number) => void;
}> = ({ disabled, value, onChange }) => {
    return (
        <Select
            data={Options}
            value={String(value)}
            disabled={disabled}
            withinPortal
            w={140}
            onChange={(val) => {
                onChange(Number(val));
            }}
        />
    );
};
export default WeekDaySelect;
