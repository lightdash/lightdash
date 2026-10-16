import { Group } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '../../../common/NumberInput';
import { Config } from '../../common/Config';

type Props = {
    label: string;
    value: number | undefined;
    onChange: (value: number | undefined) => void;
};

export const AxisMinInterval: FC<Props> = ({ label, value, onChange }) => {
    const { t } = useTranslation('vizConfig');
    return (
        <Group wrap="nowrap" gap="xs">
            <Config.Label>{label}</Config.Label>
            <NumberInput
                decimalScale="unlimited"
                size="xs"
                placeholder={t('axes.auto')}
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
};
