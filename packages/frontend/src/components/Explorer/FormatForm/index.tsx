import {
    CompactConfigMap,
    CustomFormatType,
    NumberSeparator,
    applyCustomFormat,
    convertCustomFormatToFormatExpression,
    currencies,
    findCompactConfig,
    getCompactOptionsForFormatType,
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
import { useMemo, type FC } from 'react';
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
    CustomFormatType.BYTES_SI,
    CustomFormatType.BYTES_IEC,
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

    const validCompactValue = useMemo(() => {
        const currentCompact = format.compact;
        if (!currentCompact) return null;

        const validCompacts = getCompactOptionsForFormatType(formatType);
        const compactConfig = findCompactConfig(currentCompact);

        return compactConfig && validCompacts.includes(compactConfig.compact)
            ? currentCompact
            : null;
    }, [format.compact, formatType]);

    return (
        <Stack>
            <Flex>
                <Select
                    withinPortal
                    w={200}
                    label="Type"
                    data={formatTypeOptions.map((type) => ({
                        value: type,
                        label:
                            type === CustomFormatType.BYTES_SI
                                ? 'bytes (SI)'
                                : type === CustomFormatType.BYTES_IEC
                                ? 'bytes (IEC)'
                                : type,
                    }))}
                    {...{
                        ...formatInputProps('type'),
                        onChange: (value) => {
                            if (value) {
                                setFormatFieldValue('type', value);
                                setFormatFieldValue('compact', undefined);
                            }
                        },
                    }}
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
                    CustomFormatType.BYTES_SI,
                    CustomFormatType.BYTES_IEC,
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
                CustomFormatType.BYTES_SI,
                CustomFormatType.BYTES_IEC,
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
            {[
                CustomFormatType.CURRENCY,
                CustomFormatType.NUMBER,
                CustomFormatType.BYTES_SI,
                CustomFormatType.BYTES_IEC,
            ].includes(formatType) && (
                <Flex>
                    <Select
                        withinPortal
                        mr="md"
                        w={200}
                        clearable
                        label="Compact"
                        placeholder={
                            formatType === CustomFormatType.BYTES_SI
                                ? 'E.g. kilobytes (KB)'
                                : formatType === CustomFormatType.BYTES_IEC
                                ? 'E.g. kibibytes (KiB)'
                                : 'E.g. thousands (K)'
                        }
                        data={getCompactOptionsForFormatType(formatType).map(
                            (c) => ({
                                value: c,
                                label: CompactConfigMap[c].label,
                            }),
                        )}
                        {...{
                            ...formatInputProps('compact'),
                            // Override value to ensure invalid compact values are cleared
                            value: validCompactValue,
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
