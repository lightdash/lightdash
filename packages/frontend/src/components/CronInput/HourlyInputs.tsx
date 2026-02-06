import { Group, Input, NumberInput } from '@mantine-8/core';
import React, { type FC } from 'react';
import { getHourlyCronExpression, parseCronExpression } from './cronInputUtils';

const HourlyInputs: FC<{
    disabled?: boolean;
    cronExpression: string;
    onChange: (value: string) => void;
}> = ({ disabled, cronExpression, onChange }) => {
    const minutes = parseCronExpression(cronExpression).minutes;

    const onMinuteChange = (value: string | number) => {
        if (
            typeof value === 'number' &&
            Number.isInteger(value) &&
            value >= 0 &&
            value <= 59
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
                min={0}
                max={59}
            />
        </Group>
    );
};
export default HourlyInputs;
