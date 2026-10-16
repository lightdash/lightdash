import { Group, Input } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { getWeeklyCronExpression, parseCronExpression } from './cronInputUtils';
import TimePicker from './TimePicker';
import WeekDaySelect from './WeekDaySelect';

const WeeklyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const { t } = useTranslation('scheduler');
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
        <Group wrap="nowrap" gap="sm">
            <Input.Label>{t('cronInput.on')}</Input.Label>
            <WeekDaySelect value={weekDay} onChange={onDayChange} />
            <Input.Label>{t('cronInput.at')}</Input.Label>
            <TimePicker
                disabled={disabled}
                cronExpression={cronExpression}
                onChange={onTimeChange}
            />
        </Group>
    );
};
export default WeeklyInputs;
