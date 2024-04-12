import { Group, Input } from '@mantine/core';
import React, { type FC, type ReactNode } from 'react';
import { getDailyCronExpression } from './cronInputUtils';
import TimePicker from './TimePicker';

const DailyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    timeZone: ReactNode;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange, timeZone: Timezone }) => {
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
            {Timezone}
        </Group>
    );
};
export default DailyInputs;
