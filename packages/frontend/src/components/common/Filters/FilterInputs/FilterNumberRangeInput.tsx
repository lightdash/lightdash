import { Group, Stack, Text, type TextInputProps } from '@mantine/core';
import isNil from 'lodash/isNil';
import { type FC } from 'react';
import z from 'zod';
import { useUiStrings } from '../../../../ee/providers/Embed/useUiStrings';
import FilterNumberInput from './FilterNumberInput';
import styles from './FilterNumberRangeInput.module.css';

interface Props extends Omit<TextInputProps, 'type' | 'value' | 'onChange'> {
    value?: unknown[];
    onChange: (value: unknown[]) => void;
}

const numberRangeSchema = z
    .tuple([z.number().nullable().optional(), z.number().nullable().optional()])
    .superRefine(([min, max], ctx) => {
        if (isNil(min) || isNil(max)) {
            ctx.addIssue({
                code: 'custom',
                message: 'bothValuesRequired',
                fatal: true,
            });
            return z.NEVER;
        }
        if (min > max) {
            ctx.addIssue({
                code: 'custom',
                message: 'minLessThanMax',
            });
        }
    });

const FilterNumberRangeInput: FC<Props> = ({
    value,
    disabled,
    placeholder,
    onChange,
    autoFocus,
    ...rest
}) => {
    const getUiString = useUiStrings();
    const validationResult = numberRangeSchema.safeParse(value);
    // only show one issue at a time; schema messages are UI-string key suffixes
    const errorId = validationResult.error
        ? validationResult.error.issues[0].message
        : undefined;
    const errorMessage =
        errorId === 'bothValuesRequired'
            ? getUiString('filters.inputs.bothValuesRequired')
            : errorId === 'minLessThanMax'
              ? getUiString('filters.inputs.minLessThanMax')
              : errorId;

    return (
        <Stack gap={2} w="100%">
            <Group wrap="nowrap" align="start" gap="xs">
                <FilterNumberInput
                    error={!!errorMessage}
                    disabled={disabled}
                    data-autofocus={autoFocus || undefined}
                    placeholder={getUiString('filters.inputs.minValue')}
                    {...rest}
                    value={value?.[0]}
                    onChange={(newValue) => {
                        onChange([newValue, value?.[1]]);
                    }}
                />

                <Text c="dimmed" mt={7} className={styles.noWrap} fz="xs">
                    –
                </Text>

                <FilterNumberInput
                    error={!!errorMessage}
                    disabled={disabled}
                    placeholder={getUiString('filters.inputs.maxValue')}
                    {...rest}
                    value={value?.[1]}
                    onChange={(newValue) => {
                        onChange([value?.[0], newValue]);
                    }}
                />
            </Group>
            {errorMessage && (
                <Text c="red" fz="xs">
                    {errorMessage}
                </Text>
            )}
        </Stack>
    );
};

export default FilterNumberRangeInput;
