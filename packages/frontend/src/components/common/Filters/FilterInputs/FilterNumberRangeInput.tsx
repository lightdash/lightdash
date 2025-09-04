import { Group, Stack, Text, type TextInputProps } from '@mantine/core';
import isNil from 'lodash/isNil';
import { type FC } from 'react';
import z from 'zod';
import FilterNumberInput from './FilterNumberInput';

interface Props extends Omit<TextInputProps, 'type' | 'value' | 'onChange'> {
    value?: unknown[];
    onChange: (value: unknown[]) => void;
}

const numberRangeSchema = z
    .tuple([z.number().nullable().optional(), z.number().nullable().optional()])
    .superRefine(([min, max], ctx) => {
        if (isNil(min) || isNil(max)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Both values are required',
                fatal: true,
            });
            return z.NEVER;
        }
        if (min > max) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Minimum should be less than the maximum',
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
    const validationResult = numberRangeSchema.safeParse(value);
    const errorMessage = validationResult.error
        ? validationResult.error.issues[0].message // only show one issue at a time
        : undefined;

    return (
        <Stack spacing={2} w="100%">
            <Group noWrap align="start" spacing="xs">
                <FilterNumberInput
                    error={!!errorMessage}
                    disabled={disabled}
                    autoFocus={true}
                    placeholder="Min value"
                    {...rest}
                    value={value?.[0]}
                    onChange={(newValue) => {
                        onChange([newValue, value?.[1]]);
                    }}
                />

                <Text
                    color="dimmed"
                    mt={7}
                    sx={{ whiteSpace: 'nowrap' }}
                    size="xs"
                >
                    –
                </Text>

                <FilterNumberInput
                    error={!!errorMessage}
                    disabled={disabled}
                    placeholder="Max value"
                    {...rest}
                    value={value?.[1]}
                    onChange={(newValue) => {
                        onChange([value?.[0], newValue]);
                    }}
                />
            </Group>
            {errorMessage && (
                <Text color="red" size="xs">
                    {errorMessage}
                </Text>
            )}
        </Stack>
    );
};

export default FilterNumberRangeInput;
