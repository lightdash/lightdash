import { Group, Input } from '@mantine-8/core';
import React, { type FC } from 'react';
import { getWeekdaysCronExpression } from './cronInputUtils';
import TimePicker from './TimePicker';

const WeekdaysInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const handleChange = (newTime: { hours: number; minutes: number }) => {
        onChange(getWeekdaysCronExpression(newTime.minutes, newTime.hours));
    };

    return (
        <Group gap="sm">
            <Input.Label>Monday to Friday at</Input.Label>
            <TimePicker
                disabled={disabled}
                cronExpression={cronExpression}
                onChange={handleChange}
            />
        </Group>
    );
};
export default WeekdaysInputs;
