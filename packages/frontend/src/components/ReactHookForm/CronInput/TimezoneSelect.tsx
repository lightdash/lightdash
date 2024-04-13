import { Select } from '@mantine/core';
import * as moment from 'moment-timezone';
import React, { type FC } from 'react';

const TimezoneSelect: FC<{
    disabled?: boolean;
    value?: string;
    onChange: (value: string) => void;
}> = ({ disabled, value, onChange }) => {
    const timezones: string[] = moment.tz.names();

    return (
        <Select
            data={timezones}
            value={value}
            disabled={disabled}
            withinPortal
            w={190}
            onChange={(val: string) => {
                onChange(val);
            }}
        />
    );
};
export default TimezoneSelect;
