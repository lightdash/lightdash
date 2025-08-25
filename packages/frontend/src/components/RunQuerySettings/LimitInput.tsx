import { NumberInput, type NumberInputProps } from '@mantine-8/core';
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
            label="Row limit:"
            clampBehavior="strict"
            {...numberInputProps}
        />
    );
};

export default LimitInput;
