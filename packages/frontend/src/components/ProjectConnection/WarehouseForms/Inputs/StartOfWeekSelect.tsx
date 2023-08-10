import { Select } from '@mantine/core';
import React, { FC } from 'react';

const defaultOption = { value: ' ', label: 'Auto' };
const daysOfWeekOptions = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
].map((x, index) => ({
    value: index.toString(),
    label: x,
}));

const StartOfWeekSelect: FC<{ disabled: boolean }> = ({ disabled }) => {
    return (
        <Select
            name="warehouse.startOfWeek"
            label="Start of week"
            description="Will be taken into account when using 'WEEK' time interval"
            data={[defaultOption, ...daysOfWeekOptions]}
            defaultValue={defaultOption.value}
            disabled={disabled}
            dropdownPosition="top"
        />
    );
};

export default StartOfWeekSelect;
