import { Select } from '@mantine/core';
import React, { type FC } from 'react';

const TimezoneSelect: FC<{
    disabled?: boolean;
    value: number;
    onChange: (value: number) => void;
}> = ({ disabled, value, onChange }) => {
    const timezones: string[] = Intl.supportedValuesOf("timeZone");
    timezones.push('UTC');

    return (
        <Select
            data={timezones}
            value={value}
            disabled={disabled}
            withinPortal
            w={190}
            onChange={(val) => {
                onChange(val);
            }}
        />
    );
};
export default TimezoneSelect;
