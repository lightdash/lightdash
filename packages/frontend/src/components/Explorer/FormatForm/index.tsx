import {
    Compact,
    CompactConfigMap,
    CustomFormatType,
    NumberSeparator,
    applyCustomFormat,
    convertCustomFormatToFormatExpression,
    currencies,
    type CustomFormat,
} from '@lightdash/common';
import {
    Anchor,
    Flex,
    NumberInput,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { type GetInputProps } from '@mantine/form/lib/types';
import { type FC } from 'react';
import { type ValueOf } from 'type-fest';

type Props = {
    formatInputProps: (
        path: keyof CustomFormat,
    ) => ReturnType<GetInputProps<CustomFormat>>;
    format: CustomFormat;
    setFormatFieldValue: (
        path: keyof CustomFormat,
        value: ValueOf<CustomFormat>,
    ) => void;
};

const formatTypeOptions = [
    CustomFormatType.DEFAULT,
    CustomFormatType.PERCENT,
    CustomFormatType.CURRENCY,
    CustomFormatType.NUMBER,
    CustomFormatType.CUSTOM,
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

export const FormatForm: FC<Props> = ({
    formatInputProps,
    setFormatFieldValue,
    format,
}) => {
    const formatType = format.type;

    return (
        <Stack>
            <Flex>
                <Select
                    withinPortal
                    w={200}
                    label="Type"
                    data={formatTypeOptions}
                    {...formatInputProps('type')}
                />

                {formatType !== CustomFormatType.DEFAULT && (
                    <Text ml="md" mt={30} w={200} color="gray.6">
                        {'Looks like: '}
                        {applyCustomFormat(
                            CustomFormatType.PERCENT === formatType
                                ? '0.754321'
                                : '1234.56789',
                            format,
                        )}
                    </Text>
                )}
                {[
                    CustomFormatType.CURRENCY,
                    CustomFormatType.NUMBER,
                    CustomFormatType.PERCENT,
                ].includes(formatType) && (
                    <Text ml="md" mt={30} w={200} color="gray.6">
                        {'Format: '}
                        {convertCustomFormatToFormatExpression(format)}
                    </Text>
                )}
            </Flex>
            {formatType === CustomFormatType.CUSTOM && (
                <TextInput
                    label="Format expression"
                    placeholder="E.g. #.#0"
                    description={
                        <p>
                            To help you build your format expression, we
                            recommend using{' '}
                            <Anchor
                                href="https://customformats.com"
                                target="_blank"
                            >
                                https://customformats.com
                            </Anchor>
                            .
                        </p>
                    }
                    {...formatInputProps('custom')}
                />
            )}
            {[
                CustomFormatType.CURRENCY,
                CustomFormatType.NUMBER,
                CustomFormatType.PERCENT,
            ].includes(formatType) && (
                <Flex>
                    {formatType === CustomFormatType.CURRENCY && (
                        <Select
                            withinPortal
                            mr="md"
                            w={200}
                            searchable
                            label="Currency"
                            data={formatCurrencyOptions}
                            {...formatInputProps('currency')}
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
                            ...formatInputProps('round'),
                            // Explicitly set value to undefined so the API doesn't received invalid values
                            onChange: (value) => {
                                setFormatFieldValue(
                                    'round',
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
                        {...formatInputProps('separator')}
                    />
                </Flex>
            )}
            {[CustomFormatType.CURRENCY, CustomFormatType.NUMBER].includes(
                formatType,
            ) && (
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
                            ...formatInputProps('compact'),
                            onChange: (value) => {
                                // Explicitly set value to undefined so the API doesn't received invalid values
                                setFormatFieldValue(
                                    'compact',
                                    !value || !(value in CompactConfigMap)
                                        ? undefined
                                        : value,
                                );
                            },
                        }}
                    />

                    {formatType === CustomFormatType.NUMBER && (
                        <>
                            <TextInput
                                w={200}
                                mr="md"
                                label="Prefix"
                                placeholder="E.g. GBP revenue:"
                                {...formatInputProps('prefix')}
                            />
                            <TextInput
                                w={200}
                                label="Suffix"
                                placeholder="E.g. km/h"
                                {...formatInputProps('suffix')}
                            />
                        </>
                    )}
                </Flex>
            )}
        </Stack>
    );
};
