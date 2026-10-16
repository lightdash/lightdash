import {
    Compact,
    CompactConfigMap,
    convertCustomFormatToFormatExpression,
    currencies,
    CustomFormatType,
    DimensionType,
    findCompactConfig,
    formatValueWithExpression,
    getCompactOptionsForFormatType,
    MetricType,
    NumberSeparator,
    TableCalculationType,
    type CustomFormat,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Flex,
    Grid,
    Group,
    Paper,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import {
    IconCalendar,
    IconClockHour4,
    IconExternalLink,
} from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import { useMemo, type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { type ValueOf } from 'type-fest';
import { optionalNumber } from '../../../utils/numberInputUtils';
import MantineIcon from '../../common/MantineIcon';
import { NumberInput } from '../../common/NumberInput';
import { PolymorphicPaperButton } from '../../common/PolymorphicPaperButton';
import { getFormatTypeLabel } from './getFormatSummary';

type Props = {
    formatInputProps: (
        path: keyof CustomFormat,
    ) => ReturnType<UseFormReturnType<CustomFormat>['getInputProps']>;
    format: CustomFormat;
    setFormatFieldValue: (
        path: keyof CustomFormat,
        value: ValueOf<CustomFormat>,
    ) => void;
    itemType?: DimensionType | MetricType | TableCalculationType;
    compact?: boolean;
};

const numericFormatTypeOptions = [
    CustomFormatType.DEFAULT,
    CustomFormatType.PERCENT,
    CustomFormatType.CURRENCY,
    CustomFormatType.NUMBER,
    CustomFormatType.BYTES_SI,
    CustomFormatType.BYTES_IEC,
    CustomFormatType.CUSTOM,
];

const dateFormatTypeOptions = [
    CustomFormatType.DEFAULT,
    CustomFormatType.DATE,
    CustomFormatType.TIMESTAMP,
];

const getFormatSeparatorOptions = (t: TFunction) => [
    {
        value: NumberSeparator.DEFAULT,
        label: t('formatForm.defaultSeparator'),
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
    {
        value: NumberSeparator.APOSTROPHE_PERIOD,
        label: "100'000.00",
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

// Common date and timestamp format presets
const DATE_FORMATS = [
    'dd/mm/yyyy',
    'mm-dd-yyyy',
    'd mmm yyyy',
    'mmmm d, yyyy',
    'yyyy-mm-dd',
    'ddd, MMM d, yyyy',
];

const TIMESTAMP_FORMATS = [
    'yyyy-mm-dd HH:mm:ss',
    'dd/mm/yyyy HH:mm',
    'mmmm d, yyyy h:mm AM/PM',
    'ddd, MMM d, yyyy HH:mm',
    'HH:mm:ss',
    'h:mm:ss AM/PM',
];

export const FormatForm: FC<Props> = ({
    formatInputProps,
    setFormatFieldValue,
    format,

    itemType,
    compact = false,
}) => {
    const { t } = useTranslation('explorer');
    const formatSeparatorOptions = useMemo(
        () => getFormatSeparatorOptions(t),
        [t],
    );
    const formatType = format.type;
    const formatExpression = convertCustomFormatToFormatExpression(format);
    const usesRuntimeOnlyFormatExpression =
        format.compact === Compact.AUTO &&
        (format.type === CustomFormatType.NUMBER ||
            format.type === CustomFormatType.CURRENCY);

    const isDateField = useMemo(() => {
        return (
            itemType === DimensionType.DATE ||
            itemType === DimensionType.TIMESTAMP ||
            itemType === MetricType.DATE ||
            itemType === MetricType.TIMESTAMP ||
            itemType === TableCalculationType.DATE ||
            itemType === TableCalculationType.TIMESTAMP
        );
    }, [itemType]);

    const sampleDate = useMemo(() => new Date(), []);

    const validCompactValue = useMemo(() => {
        const currentCompact = format.compact;
        if (!currentCompact) return null;

        const validCompacts = getCompactOptionsForFormatType(formatType);
        const compactConfig = findCompactConfig(currentCompact);

        return compactConfig && validCompacts.includes(compactConfig.compact)
            ? currentCompact
            : null;
    }, [format.compact, formatType]);

    const formatTypeOptions = isDateField
        ? dateFormatTypeOptions
        : numericFormatTypeOptions;

    // Show date-specific UI for date fields with custom format (not default)
    const isDateType =
        formatType === CustomFormatType.DATE ||
        formatType === CustomFormatType.TIMESTAMP ||
        (isDateField && formatType === CustomFormatType.CUSTOM);

    // Generate examples based on item type (dimension/metric type)
    const isTimestampField =
        itemType === DimensionType.TIMESTAMP ||
        itemType === MetricType.TIMESTAMP ||
        itemType === TableCalculationType.TIMESTAMP;

    const dateExamples = useMemo(() => {
        const formats = isTimestampField ? TIMESTAMP_FORMATS : DATE_FORMATS;

        return formats.map((fmt) => ({
            format: fmt,
            example: formatValueWithExpression(fmt, sampleDate),
        }));
    }, [isTimestampField, sampleDate]);

    // Generate preview for date formats
    const datePreview = useMemo(() => {
        if (!isDateType) return null;
        if (!format.custom) return null;
        try {
            return {
                value: formatValueWithExpression(format.custom, sampleDate),
                isInvalid: false,
            };
        } catch {
            return { value: t('formatForm.invalidFormat'), isInvalid: true };
        }
    }, [isDateType, format.custom, sampleDate, t]);

    return (
        <Grid gap="md" columns={12}>
            {/* Format Type Selection */}
            {isDateField ? (
                <Grid.Col span={12}>
                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            {t('formatForm.format')}
                        </Text>
                        <SegmentedControl
                            w="fit-content"
                            size="sm"
                            data={[
                                {
                                    label: t('formatForm.default'),
                                    value: CustomFormatType.DEFAULT,
                                },
                                {
                                    label: t('formatForm.custom'),
                                    value: 'custom',
                                },
                            ]}
                            value={
                                format.type === CustomFormatType.DEFAULT
                                    ? CustomFormatType.DEFAULT
                                    : 'custom'
                            }
                            onChange={(value) => {
                                if (value === CustomFormatType.DEFAULT) {
                                    setFormatFieldValue(
                                        'type',
                                        CustomFormatType.DEFAULT,
                                    );
                                    setFormatFieldValue('custom', undefined);
                                } else {
                                    setFormatFieldValue(
                                        'type',
                                        CustomFormatType.CUSTOM,
                                    );
                                }
                            }}
                        />
                    </Stack>
                </Grid.Col>
            ) : (
                <Grid.Col span={compact ? 12 : 4}>
                    <Select
                        label={t('formatForm.formatType')}
                        data={formatTypeOptions.map((type) => ({
                            value: type,
                            label: getFormatTypeLabel(type),
                        }))}
                        {...{
                            ...formatInputProps('type'),
                            onChange: (value) => {
                                if (value) {
                                    setFormatFieldValue(
                                        'type',
                                        value as CustomFormatType,
                                    );
                                    setFormatFieldValue('compact', undefined);
                                    if (
                                        value !== CustomFormatType.CUSTOM &&
                                        value !== CustomFormatType.DATE &&
                                        value !== CustomFormatType.TIMESTAMP
                                    ) {
                                        setFormatFieldValue(
                                            'custom',
                                            undefined,
                                        );
                                    }
                                }
                            },
                        }}
                    />
                </Grid.Col>
            )}

            {/* Date/Timestamp Format Section */}
            {isDateType && (
                <Grid.Col span={12}>
                    <Stack gap="md">
                        <Flex
                            align={compact ? 'stretch' : 'flex-end'}
                            direction={compact ? 'column' : 'row'}
                            gap="md"
                        >
                            <TextInput
                                flex={1}
                                maw={compact ? undefined : 400}
                                leftSection={
                                    <MantineIcon
                                        icon={
                                            isTimestampField
                                                ? IconClockHour4
                                                : IconCalendar
                                        }
                                        color="dimmed"
                                    />
                                }
                                label={t('formatForm.customFormat')}
                                placeholder={t(
                                    'formatForm.customFormatPlaceholder',
                                )}
                                {...formatInputProps('custom')}
                            />
                            {format.custom && (
                                <Box pb={2}>
                                    <Text size="xs" c="dimmed" fw={500} mb={4}>
                                        {t('formatForm.result')}
                                    </Text>
                                    <Paper
                                        px="md"
                                        h={36}
                                        display="flex"
                                        radius="md"
                                        bg="ldGray.0"
                                    >
                                        <Text
                                            size="sm"
                                            fw={600}
                                            c={
                                                datePreview?.isInvalid
                                                    ? 'red.6'
                                                    : 'inherit'
                                            }
                                        >
                                            {datePreview?.value || '...'}
                                        </Text>
                                    </Paper>
                                </Box>
                            )}
                        </Flex>

                        <Stack gap="xs">
                            <Group gap="xs">
                                <Text size="xs" c="dimmed" fw={500}>
                                    {t('formatForm.commonFormats')}
                                </Text>
                                <Anchor
                                    href="https://customformats.com"
                                    target="_blank"
                                    size="xs"
                                >
                                    <MantineIcon
                                        icon={IconExternalLink}
                                        size="sm"
                                        color="blue.6"
                                    />
                                </Anchor>
                            </Group>
                            <Flex gap="xs" wrap="wrap">
                                {dateExamples.map(
                                    ({ format: fmt, example }) => (
                                        <PolymorphicPaperButton
                                            key={fmt}
                                            withBorder
                                            p="xs"
                                            shadow="none"
                                            radius="md"
                                            onClick={() =>
                                                setFormatFieldValue(
                                                    'custom',
                                                    fmt,
                                                )
                                            }
                                        >
                                            <Text
                                                size="xs"
                                                c="ldDark.8"
                                                fw={500}
                                            >
                                                {example}
                                            </Text>
                                            <Text size="xs" c="ldGray.5">
                                                {fmt}
                                            </Text>
                                        </PolymorphicPaperButton>
                                    ),
                                )}
                            </Flex>
                        </Stack>
                    </Stack>
                </Grid.Col>
            )}

            {/* Custom Format Expression (non-date fields only) */}
            {formatType === CustomFormatType.CUSTOM && !isDateField && (
                <Grid.Col span={12}>
                    <TextInput
                        label={t('formatForm.formatExpression')}
                        placeholder={t(
                            'formatForm.formatExpressionPlaceholder',
                        )}
                        description={
                            <Group gap="two">
                                <MantineIcon
                                    icon={IconExternalLink}
                                    size="sm"
                                    color="blue.6"
                                />
                                <Anchor
                                    href="https://customformats.com"
                                    target="_blank"
                                    size="xs"
                                >
                                    {t('formatForm.buildAtCustomFormats')}
                                </Anchor>
                            </Group>
                        }
                        {...formatInputProps('custom')}
                    />
                </Grid.Col>
            )}

            {/* Numeric Format Options */}
            {[
                CustomFormatType.CURRENCY,
                CustomFormatType.NUMBER,
                CustomFormatType.PERCENT,
                CustomFormatType.BYTES_SI,
                CustomFormatType.BYTES_IEC,
            ].includes(formatType) && (
                <>
                    {formatType === CustomFormatType.CURRENCY && (
                        <Grid.Col span={compact ? 12 : 4}>
                            <Select
                                searchable
                                label={t('formatForm.currency')}
                                data={formatCurrencyOptions}
                                {...formatInputProps('currency')}
                            />
                        </Grid.Col>
                    )}
                    <Grid.Col span={compact ? 12 : 4}>
                        <NumberInput
                            min={0}
                            label={t('formatForm.decimalPlaces')}
                            placeholder={t('formatForm.auto')}
                            {...{
                                ...formatInputProps('round'),
                                onChange: (value) => {
                                    setFormatFieldValue(
                                        'round',
                                        optionalNumber(value),
                                    );
                                },
                            }}
                        />
                    </Grid.Col>
                    <Grid.Col span={compact ? 12 : 4}>
                        <Select
                            label={t('formatForm.separatorStyle')}
                            data={formatSeparatorOptions}
                            {...formatInputProps('separator')}
                        />
                    </Grid.Col>
                </>
            )}

            {/* Compact and Prefix/Suffix Options */}
            {[
                CustomFormatType.CURRENCY,
                CustomFormatType.NUMBER,
                CustomFormatType.BYTES_SI,
                CustomFormatType.BYTES_IEC,
            ].includes(formatType) && (
                <>
                    <Grid.Col span={12}>
                        <Select
                            clearable
                            label={t('formatForm.compact')}
                            placeholder={
                                formatType === CustomFormatType.BYTES_SI
                                    ? t('formatForm.compactPlaceholder.bytesSi')
                                    : formatType === CustomFormatType.BYTES_IEC
                                      ? t(
                                            'formatForm.compactPlaceholder.bytesIec',
                                        )
                                      : t(
                                            'formatForm.compactPlaceholder.number',
                                        )
                            }
                            data={getCompactOptionsForFormatType(
                                formatType,
                            ).map((c) => ({
                                value: c,
                                label: CompactConfigMap[c].label,
                            }))}
                            {...{
                                ...formatInputProps('compact'),
                                value: validCompactValue,
                                onChange: (value) => {
                                    setFormatFieldValue(
                                        'compact',
                                        !value || !(value in CompactConfigMap)
                                            ? undefined
                                            : value,
                                    );
                                },
                            }}
                        />
                    </Grid.Col>

                    {formatType === CustomFormatType.NUMBER && (
                        <>
                            <Grid.Col span={compact ? 12 : 4}>
                                <TextInput
                                    label={t('formatForm.prefix')}
                                    placeholder={t(
                                        'formatForm.prefixPlaceholder',
                                    )}
                                    {...formatInputProps('prefix')}
                                />
                            </Grid.Col>
                            <Grid.Col span={compact ? 12 : 4}>
                                <TextInput
                                    label={t('formatForm.suffix')}
                                    placeholder={t(
                                        'formatForm.suffixPlaceholder',
                                    )}
                                    {...formatInputProps('suffix')}
                                />
                            </Grid.Col>
                        </>
                    )}
                </>
            )}

            {/* Format Expression Display */}
            {[
                CustomFormatType.CURRENCY,
                CustomFormatType.NUMBER,
                CustomFormatType.PERCENT,
                CustomFormatType.BYTES_SI,
                CustomFormatType.BYTES_IEC,
            ].includes(formatType) && (
                <Grid.Col span={12}>
                    <Text size="xs" c="ldGray.5">
                        <Trans
                            t={t}
                            i18nKey="formatForm.expressionSummary"
                            values={{
                                expression: usesRuntimeOnlyFormatExpression
                                    ? t('formatForm.runtimeOnly')
                                    : formatExpression ||
                                      t('formatForm.defaultExpression'),
                            }}
                            components={{
                                value: <Text span fw={500} c="ldGray.7" />,
                            }}
                        />
                    </Text>
                </Grid.Col>
            )}
        </Grid>
    );
};
