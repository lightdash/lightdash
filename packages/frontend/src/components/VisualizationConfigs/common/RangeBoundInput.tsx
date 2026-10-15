import { Select } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
}) => {
    const { t } = useTranslation('vizConfig');
    return (
        <>
            <Select
                allowDeselect={false}
                flex="0 1 100%"
                label={t('common.rangeBound.type', { label })}
                data={[
                    { value: 'custom', label: t('common.rangeBound.custom') },
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
                placeholder={
                    value === 'auto' ? t('common.rangeBound.auto') : undefined
                }
                label={<Config.Label>{label}</Config.Label>}
                leftSection={leftSection}
                value={value === 'auto' ? '' : value}
                onNumberChange={(newValue) => {
                    if (newValue !== undefined) onChange(newValue);
                }}
            />
        </>
    );
};
