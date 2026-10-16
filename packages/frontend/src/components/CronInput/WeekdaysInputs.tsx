import { Group, Input } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { getWeekdaysCronExpression } from './cronInputUtils';
import TimePicker from './TimePicker';

const WeekdaysInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const { t } = useTranslation('scheduler');
    const handleChange = (newTime: { hours: number; minutes: number }) => {
        onChange(getWeekdaysCronExpression(newTime.minutes, newTime.hours));
    };

    return (
        <Group gap="sm">
            <Input.Label>{t('cronInput.mondayToFridayAt')}</Input.Label>
            <TimePicker
                disabled={disabled}
                cronExpression={cronExpression}
                onChange={handleChange}
            />
        </Group>
    );
};
export default WeekdaysInputs;
