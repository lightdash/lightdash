import { Select } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { NumberInput } from '../../common/NumberInput';
import { Config } from './Config';

type RangeBoundInputProps = {
    value: number | 'auto';
    onChange: (value: number | 'auto') => void;
    label: string;
    autoLabel: string;
    leftSection?: ReactNode;
};

export const RangeBoundInput: FC<RangeBoundInputProps> = ({
    value,
    onChange,
    label,
    autoLabel,
    leftSection,
}) => (
    <>
        <Select
            allowDeselect={false}
            flex="0 1 100%"
            label={`${label} type`}
            data={[
                { value: 'custom', label: 'Custom' },
                { value: 'auto', label: autoLabel },
            ]}
            value={value === 'auto' ? 'auto' : 'custom'}
            onChange={(nextValue) =>
                onChange(nextValue === 'auto' ? 'auto' : 0)
            }
        />
        <NumberInput
            flex="0 1 auto"
            w="100%"
            size="xs"
            hideControls
            decimalScale="unlimited"
            disabled={value === 'auto'}
            placeholder={value === 'auto' ? 'Auto' : undefined}
            label={<Config.Label>{label}</Config.Label>}
            leftSection={leftSection}
            value={value === 'auto' ? '' : value}
            onNumberChange={(newValue) => {
                if (newValue !== undefined) onChange(newValue);
            }}
        />
    </>
);
