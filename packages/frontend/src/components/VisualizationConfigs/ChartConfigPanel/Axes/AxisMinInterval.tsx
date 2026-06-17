import { Group, NumberInput } from '@mantine-8/core';
import { type FC } from 'react';
import { Config } from '../../common/Config';

type Props = {
    label: string;
    value: number | undefined;
    onChange: (value: number | undefined) => void;
};

export const AxisMinInterval: FC<Props> = ({ label, value, onChange }) => (
    <Group wrap="nowrap" gap="xs">
        <Config.Label>{label}</Config.Label>
        <NumberInput
            placeholder="Auto"
            value={value ?? ''}
            min={0}
            step={1}
            w={80}
            onChange={(newValue) =>
                onChange(
                    typeof newValue === 'number' && newValue > 0
                        ? newValue
                        : undefined,
                )
            }
        />
    </Group>
);
