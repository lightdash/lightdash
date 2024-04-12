import { Group, Input, NumberInput } from '@mantine/core';
import React, { type FC, type ReactNode } from 'react';
import {
    getMonthlyCronExpression,
    parseCronExpression,
} from './cronInputUtils';
import TimePicker from './TimePicker';

const MonthlyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    timeZone: ReactNode;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange, timeZone: Timezone }) => {
    const { minutes, hours, day } = parseCronExpression(cronExpression);

    const onDayChange = (newDay: number) => {
        if (newDay >= 1 && newDay <= 31) {
            onChange(getMonthlyCronExpression(minutes, hours, newDay));
        }
    };

    const onTimeChange = (newTime: { minutes: number; hours: number }) => {
        onChange(getMonthlyCronExpression(newTime.minutes, newTime.hours, day));
    };

    return (
        <Group spacing="sm">
            <Input.Label>on day</Input.Label>
            <NumberInput
                value={day}
                onChange={onDayChange}
                disabled={disabled}
                w="6xl"
                min={1}
                max={31}
            />
            <Input.Label>at</Input.Label>

            <TimePicker
                disabled={disabled}
                cronExpression={cronExpression}
                onChange={onTimeChange}
            />
            {Timezone}
        </Group>
    );
};
export default MonthlyInputs;
