import { type NumberInputProps } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '../common/NumberInput';
import { type Props } from './index';

type LimitInputProps = Pick<
    Props,
    'limit' | 'maxLimit' | 'onLimitChange' | 'size'
> & {
    numberInputProps?: Omit<NumberInputProps, 'value' | 'onChange'>;
};

const LimitInput = ({
    limit,
    maxLimit,
    onLimitChange,
    size,
    numberInputProps,
}: LimitInputProps) => {
    const { t } = useTranslation('explorer');
    if (!maxLimit) return null;

    return (
        <NumberInput
            value={limit}
            onChange={(value) => {
                if (typeof value === 'number') {
                    onLimitChange(value);
                }
            }}
            min={1}
            max={maxLimit}
            step={100}
            size={size}
            label={t('runQuerySettings.rowLimit')}
            clampBehavior="strict"
            {...numberInputProps}
        />
    );
};

export default LimitInput;
