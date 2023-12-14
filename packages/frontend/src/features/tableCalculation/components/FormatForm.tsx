import {
    Compact,
    CompactConfigMap,
    currencies,
    formatTableCalculationValue,
    NumberSeparator,
    TableCalculationFormatType,
} from '@lightdash/common';
import {
    Flex,
    NumberInput,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { FC } from 'react';
import { TableCalculationForm } from '../types';

type Props = {
    form: TableCalculationForm;
};

const formatTypeOptions = [
    TableCalculationFormatType.DEFAULT,
    TableCalculationFormatType.PERCENT,
    TableCalculationFormatType.CURRENCY,
    TableCalculationFormatType.NUMBER,
];

const formatSeparatorOptions = [
    {
        value: NumberSeparator.DEFAULT,
        label: 'Default separator',
    },
    {
        value: NumberSeparator.COMMA_PERIOD,
        label: '100,000.00',
    },
    {
        value: NumberSeparator.SPACE_PERIOD,
        label: '100 000.00',
    },
    {
        value: NumberSeparator.PERIOD_COMMA,
        label: '100.000,00',
    },
    {
        value: NumberSeparator.NO_SEPARATOR_PERIOD,
        label: '100000.00',
    },
];

const formatCurrencyOptions = currencies.map((c) => {
    const currencyFormat = Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: c,
    });

    return {
        value: c,
        label: `${c} (${currencyFormat
            .format(1234.56)
            .replace(/\u00A0/, ' ')})`,
    };
});

export const FormatForm: FC<Props> = ({ form }) => {
    const formatType = form.values.format.type;

    return (
        <Stack p="sm">
            <Flex>
                <Select
                    withinPortal
                    w={200}
                    label="Type"
                    data={formatTypeOptions}
                    {...form.getInputProps('format.type')}
                />

                {formatType !== TableCalculationFormatType.DEFAULT && (
                    <Text ml="md" mt={30} color="gray.6">
                        {'Looks like: '}
                        {formatTableCalculationValue(
                            {
                                name: 'preview',
                                sql: '',
                                displayName: 'preview',
                                format: form.values.format,
                            },
                            TableCalculationFormatType.PERCENT === formatType
                                ? '0.75'
                                : '1234.56',
                        )}
                    </Text>
                )}
            </Flex>

            {formatType !== TableCalculationFormatType.DEFAULT && (
                <Flex>
                    {formatType === TableCalculationFormatType.CURRENCY && (
                        <Select
                            withinPortal
                            mr="md"
                            w={200}
                            searchable
                            label="Currency"
                            data={formatCurrencyOptions}
                            {...form.getInputProps('format.currency')}
                        />
                    )}
                    <NumberInput
                        // NOTE: Mantine's NumberInput component is not working properly when initial value in useForm is undefined
                        type="number"
                        min={0}
                        w={200}
                        label="Round"
                        placeholder="Number of decimal places"
                        {...{
                            ...form.getInputProps('format.round'),
                            // Explicitly set value to undefined so the API doesn't received invalid values
                            onChange: (value) => {
                                form.setFieldValue(
                                    'format.round',
                                    value === '' ? undefined : value,
                                );
                            },
                        }}
                    />
                    <Select
                        withinPortal
                        w={200}
                        ml="md"
                        label="Separator style"
                        data={formatSeparatorOptions}
                        {...form.getInputProps('format.separator')}
                    />
                </Flex>
            )}
            {(formatType === TableCalculationFormatType.CURRENCY ||
                formatType === TableCalculationFormatType.NUMBER) && (
                <Flex>
                    <Select
                        withinPortal
                        mr="md"
                        w={200}
                        clearable
                        label="Compact"
                        placeholder="E.g. thousands (K)"
                        data={[
                            ...Object.values(Compact).map((c) => ({
                                value: c,
                                label: CompactConfigMap[c].label,
                            })),
                        ]}
                        {...{
                            ...form.getInputProps('format.compact'),
                            onChange: (value) => {
                                // Explicitly set value to undefined so the API doesn't received invalid values
                                form.setFieldValue(
                                    'format.compact',
                                    !value || !(value in CompactConfigMap)
                                        ? undefined
                                        : value,
                                );
                            },
                        }}
                    />

                    {formatType === TableCalculationFormatType.NUMBER && (
                        <>
                            <TextInput
                                w={200}
                                mr="md"
                                label="Prefix"
                                placeholder="E.g. GBP revenue:"
                                {...form.getInputProps('format.prefix')}
                            />
                            <TextInput
                                w={200}
                                label="Suffix"
                                placeholder="E.g. km/h"
                                {...form.getInputProps('format.suffix')}
                            />
                        </>
                    )}
                </Flex>
            )}
        </Stack>
    );
};
