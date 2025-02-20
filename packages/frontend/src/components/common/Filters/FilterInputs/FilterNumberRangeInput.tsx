import { Group, Text, type TextInputProps } from '@mantine/core';
import { type FC } from 'react';
import FilterNumberInput from './FilterNumberInput';

interface Props extends Omit<TextInputProps, 'type' | 'value' | 'onChange'> {
    value?: unknown[];
    onChange: (value: unknown[]) => void;
}

const FilterNumberRangeInput: FC<Props> = ({
    value,
    disabled,
    placeholder,
    onChange,
    autoFocus,
    ...rest
}) => {
    const isInvalid = !(
        value?.[0] == null ||
        value?.[1] == null ||
        value[0] < value[1]
    );
    return (
        <Group noWrap align="start" w="100%" spacing="xs">
            <FilterNumberInput
                error={
                    isInvalid
                        ? 'Minimum should be less than the maximum'
                        : undefined
                }
                disabled={disabled}
                autoFocus={true}
                placeholder="Min value"
                {...rest}
                value={value?.[0]}
                onChange={(newValue) => {
                    onChange([newValue, value?.[1]]);
                }}
            />

            <Text color="dimmed" mt={7} sx={{ whiteSpace: 'nowrap' }} size="xs">
                –
            </Text>

            <FilterNumberInput
                error={isInvalid}
                disabled={disabled}
                placeholder="Max value"
                {...rest}
                value={value?.[1]}
                onChange={(newValue) => {
                    onChange([value?.[0], newValue]);
                }}
            />
        </Group>
    );
};

export default FilterNumberRangeInput;
