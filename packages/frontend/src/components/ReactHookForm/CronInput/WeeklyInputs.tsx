import { Group, Input } from '@mantine/core';
import React, { type FC } from 'react';
import { getWeeklyCronExpression, parseCronExpression } from './cronInputUtils';
import TimePicker from './TimePicker';
import WeekDaySelect from './WeekDaySelect';

const WeeklyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    timeZone: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange, timeZone: Timezone }) => {
    const { minutes, hours, weekDay } = parseCronExpression(cronExpression);

    const onDayChange = (newWeekday: number) => {
        onChange(getWeeklyCronExpression(minutes, hours, newWeekday));
    };

    const onTimeChange = (newTime: { hours: number; minutes: number }) => {
        onChange(
            getWeeklyCronExpression(newTime.minutes, newTime.hours, weekDay),
        );
    };
    return (
        <>
            <Input.Label>on</Input.Label>
            <WeekDaySelect value={weekDay} onChange={onDayChange} />
            <Input.Label>at</Input.Label>
            <Group noWrap spacing="sm">
                <TimePicker
                    disabled={disabled}
                    cronExpression={cronExpression}
                    onChange={onTimeChange}
                />
                {Timezone}
            </Group>
        </>
    );
};
export default WeeklyInputs;
