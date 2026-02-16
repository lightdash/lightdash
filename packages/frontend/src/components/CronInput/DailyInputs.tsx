import { Group, Input } from '@mantine-8/core';
import React, { type FC } from 'react';
import TimePicker from './TimePicker';
import { getDailyCronExpression } from './cronInputUtils';

const DailyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const handleChange = (newTime: { hours: number; minutes: number }) => {
        onChange(getDailyCronExpression(newTime.minutes, newTime.hours));
    };

    return (
        <Group gap="sm">
            <Input.Label>at</Input.Label>
            <TimePicker
                disabled={disabled}
                cronExpression={cronExpression}
                onChange={handleChange}
            />
        </Group>
    );
};
export default DailyInputs;
