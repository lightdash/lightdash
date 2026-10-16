import { Group, Input } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { getDailyCronExpression } from './cronInputUtils';
import TimePicker from './TimePicker';

const DailyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const { t } = useTranslation('scheduler');
    const handleChange = (newTime: { hours: number; minutes: number }) => {
        onChange(getDailyCronExpression(newTime.minutes, newTime.hours));
    };

    return (
        <Group gap="sm">
            <Input.Label>{t('cronInput.at')}</Input.Label>
            <TimePicker
                disabled={disabled}
                cronExpression={cronExpression}
                onChange={handleChange}
            />
        </Group>
    );
};
export default DailyInputs;
