import { Group, Input } from '@mantine/core';
import React, { type FC } from 'react';
import { getDailyCronExpression } from './cronInputUtils';
import TimePicker from './TimePicker';

const DailyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const handleChange = (newTime: { hours: number; minutes: number }) => {
        onChange(getDailyCronExpression(newTime.minutes, newTime.hours));
    };

    return (
        <Group spacing="sm">
            <Input.Label>at</Input.Label>
            <TimePicker
                disabled={disabled}
                cronExpression={cronExpression}
                onChange={handleChange}
            />
            <Input.Label>UTC</Input.Label>
        </Group>
    );
};
export default DailyInputs;
