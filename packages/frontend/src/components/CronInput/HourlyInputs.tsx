import { Group, Input } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '../common/NumberInput';
import { getHourlyCronExpression, parseCronExpression } from './cronInputUtils';

const MIN_MINUTES = 0;
const MAX_MINUTES = 59;

const HourlyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const { t } = useTranslation('scheduler');
    const minutes = parseCronExpression(cronExpression).minutes;
    const isOutOfRange = minutes < MIN_MINUTES || minutes > MAX_MINUTES;

    const onMinuteChange = (value: string | number) => {
        if (
            typeof value === 'number' &&
            Number.isInteger(value) &&
            value >= MIN_MINUTES &&
            value <= MAX_MINUTES
        ) {
            onChange(getHourlyCronExpression(value));
        }
    };

    return (
        <Group gap="sm">
            <Input.Label>{t('cronInput.atMinute')}</Input.Label>
            <NumberInput
                value={minutes}
                onChange={onMinuteChange}
                disabled={disabled}
                w="6xl"
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                allowDecimal={false}
                error={
                    isOutOfRange ? t('cronInput.minuteOutOfRange') : undefined
                }
            />
        </Group>
    );
};
export default HourlyInputs;
