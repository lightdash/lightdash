import { Group, Input, NumberInput } from '@mantine-8/core';
import { type FC } from 'react';
import { getHourlyCronExpression, parseCronExpression } from './cronInputUtils';

const MIN_MINUTES = 0;
const MAX_MINUTES = 59;

const HourlyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
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
            <Input.Label>at minute</Input.Label>
            <NumberInput
                value={minutes}
                onChange={onMinuteChange}
                disabled={disabled}
                w="6xl"
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                allowDecimal={false}
                error={isOutOfRange ? 'Must be between 0 and 59' : undefined}
            />
        </Group>
    );
};
export default HourlyInputs;
