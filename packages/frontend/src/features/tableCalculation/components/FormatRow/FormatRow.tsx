import {
    assertUnreachable,
    CompactConfigMap,
    convertCustomFormatToFormatExpression,
    currencies,
    CustomFormatType,
    findCompactConfig,
    formatValueWithExpression,
    getCompactOptionsForFormatType,
    NumberSeparator,
    TableCalculationType,
    type CustomFormat,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Group,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
    type ComboboxItem,
} from '@mantine-8/core';
import { NumberInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import {
    Icon123,
    IconAbc,
    IconArrowBackUp,
    IconCalendar,
    IconClockHour4,
    IconExternalLink,
    IconPalette,
    IconToggleLeft,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { type ValueOf } from 'type-fest';
import MantineIcon from '../../../../components/common/MantineIcon';
import { PolymorphicPaperButton } from '../../../../components/common/PolymorphicPaperButton';
import classes from './FormatRow.module.css';

type Props = {
    format: CustomFormat;
    setFormatFieldValue: (
        path: keyof CustomFormat,
        value: ValueOf<CustomFormat>,
    ) => void;
    formatInputProps: (
        path: keyof CustomFormat,
    ) => ReturnType<UseFormReturnType<CustomFormat>['getInputProps']>;
    dataType: TableCalculationType;
    onDataTypeChange: (value: TableCalculationType) => void;
};

type NumericPill =
    | CustomFormatType.DEFAULT
    | CustomFormatType.NUMBER
    | CustomFormatType.CURRENCY
    | CustomFormatType.PERCENT
    | 'bytes'
    | CustomFormatType.CUSTOM;

type DatePill = CustomFormatType.DEFAULT | CustomFormatType.CUSTOM;

const NUMERIC_SAMPLE = 1234.5678;

const dataTypeMeta = {
    [TableCalculationType.NUMBER]: { label: 'Number', icon: Icon123 },
    [TableCalculationType.STRING]: { label: 'String', icon: IconAbc },
    [TableCalculationType.DATE]: { label: 'Date', icon: IconCalendar },
    [TableCalculationType.TIMESTAMP]: {
        label: 'Timestamp',
        icon: IconClockHour4,
    },
    [TableCalculationType.BOOLEAN]: {
        label: 'Boolean',
        icon: IconToggleLeft,
    },
} as const satisfies Record<
    TableCalculationType,
    { label: string; icon: typeof Icon123 }
>;

const numericPills: { value: NumericPill; label: string }[] = [
    { value: CustomFormatType.DEFAULT, label: 'Plain' },
    { value: CustomFormatType.NUMBER, label: 'Number' },
    { value: CustomFormatType.CURRENCY, label: 'Currency' },
    { value: CustomFormatType.PERCENT, label: 'Percent' },
    { value: 'bytes', label: 'Bytes' },
    { value: CustomFormatType.CUSTOM, label: 'Custom' },
];

const datePills: { value: DatePill; label: string }[] = [
    { value: CustomFormatType.DEFAULT, label: 'Default' },
    { value: CustomFormatType.CUSTOM, label: 'Custom' },
];

const separatorOptions: ComboboxItem[] = [
    { value: NumberSeparator.DEFAULT, label: 'Default separator' },
    { value: NumberSeparator.COMMA_PERIOD, label: '100,000.00' },
    { value: NumberSeparator.SPACE_PERIOD, label: '100 000.00' },
    { value: NumberSeparator.PERIOD_COMMA, label: '100.000,00' },
    { value: NumberSeparator.NO_SEPARATOR_PERIOD, label: '100000.00' },
];

const bytesUnitOptions: { value: 'si' | 'iec'; label: string }[] = [
    { value: 'si', label: 'SI (KB, MB, GB)' },
    { value: 'iec', label: 'IEC (KiB, MiB, GiB)' },
];

const currencyOptions: ComboboxItem[] = currencies.map((c) => {
    const formatter = Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: c,
    });
    return {
        value: c,
        label: `${c} (${formatter.format(1234.56).replace(/\u00A0/, ' ')})`,
    };
});

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

const isDateLike = (dataType: TableCalculationType) =>
    dataType === TableCalculationType.DATE ||
    dataType === TableCalculationType.TIMESTAMP;

const isFormatRowVisible = (dataType: TableCalculationType) =>
    dataType === TableCalculationType.NUMBER || isDateLike(dataType);

const getNumericPillValue = (formatType: CustomFormatType): NumericPill => {
    if (
        formatType === CustomFormatType.BYTES_SI ||
        formatType === CustomFormatType.BYTES_IEC
    ) {
        return 'bytes';
    }
    switch (formatType) {
        case CustomFormatType.DEFAULT:
        case CustomFormatType.NUMBER:
        case CustomFormatType.CURRENCY:
        case CustomFormatType.PERCENT:
        case CustomFormatType.CUSTOM:
            return formatType;
        // ID/DATE/TIMESTAMP can't be reached through this UI for a NUMBER
        // data type, but stale records may carry them — fall back to Plain.
        case CustomFormatType.ID:
        case CustomFormatType.DATE:
        case CustomFormatType.TIMESTAMP:
            return CustomFormatType.DEFAULT;
        default:
            return assertUnreachable(formatType, 'Unknown format type');
    }
};

const getDatePillValue = (
    formatType: CustomFormatType,
    dataType: TableCalculationType,
): DatePill => {
    const matchesType =
        (dataType === TableCalculationType.DATE &&
            formatType === CustomFormatType.DATE) ||
        (dataType === TableCalculationType.TIMESTAMP &&
            formatType === CustomFormatType.TIMESTAMP) ||
        formatType === CustomFormatType.CUSTOM;
    return matchesType ? CustomFormatType.CUSTOM : CustomFormatType.DEFAULT;
};

const getPreviewValue = (
    format: CustomFormat,
    dataType: TableCalculationType,
): string | null => {
    try {
        if (isDateLike(dataType)) {
            if (
                format.type === CustomFormatType.CUSTOM &&
                format.custom &&
                format.custom.trim().length > 0
            ) {
                return formatValueWithExpression(format.custom, new Date());
            }
            return null;
        }

        const expression = convertCustomFormatToFormatExpression(format);
        if (!expression) return String(NUMERIC_SAMPLE);
        return formatValueWithExpression(expression, NUMERIC_SAMPLE);
    } catch {
        return 'Invalid format';
    }
};

const renderDataTypeOption = ({ option }: { option: ComboboxItem }) => {
    const meta = dataTypeMeta[option.value as TableCalculationType];
    return (
        <Group gap="xs" wrap="nowrap">
            <MantineIcon icon={meta.icon} size="sm" />
            <Text size="sm" fw={500}>
                {meta.label}
            </Text>
        </Group>
    );
};

export const FormatRow: FC<Props> = ({
    format,
    setFormatFieldValue,
    formatInputProps,
    dataType,
    onDataTypeChange,
}) => {
    const dataTypeOptions = useMemo(
        () =>
            (Object.keys(dataTypeMeta) as TableCalculationType[]).map(
                (value) => ({
                    value,
                    label: dataTypeMeta[value].label,
                }),
            ),
        [],
    );

    const selectedDataTypeMeta = dataTypeMeta[dataType];

    const isBytes =
        format.type === CustomFormatType.BYTES_SI ||
        format.type === CustomFormatType.BYTES_IEC;

    const numericPill = useMemo(
        () => getNumericPillValue(format.type),
        [format.type],
    );

    const datePill = useMemo(
        () => getDatePillValue(format.type, dataType),
        [format.type, dataType],
    );

    const previewValue = useMemo(
        () => getPreviewValue(format, dataType),
        [format, dataType],
    );

    const compactValidValue = useMemo(() => {
        if (!format.compact) return null;
        const allowed = getCompactOptionsForFormatType(format.type);
        const config = findCompactConfig(format.compact);
        return config && allowed.includes(config.compact)
            ? format.compact
            : null;
    }, [format.compact, format.type]);

    const compactSelectData = useMemo(
        () =>
            getCompactOptionsForFormatType(format.type).map((c) => ({
                value: c,
                label: CompactConfigMap[c].label,
            })),
        [format.type],
    );

    const handleNumericPillChange = (next: NumericPill) => {
        // Format-type changes always reset compact, since allowed values differ
        // per type. Reset `custom` whenever the new type can't use it.
        setFormatFieldValue('compact', undefined);

        if (next === 'bytes') {
            // Default to SI; user can flip to IEC via the unit sub-select.
            setFormatFieldValue('type', CustomFormatType.BYTES_SI);
            setFormatFieldValue('custom', undefined);
            return;
        }

        setFormatFieldValue('type', next);

        if (next !== CustomFormatType.CUSTOM) {
            setFormatFieldValue('custom', undefined);
        }
        if (
            next !== CustomFormatType.NUMBER &&
            next !== CustomFormatType.CURRENCY &&
            next !== CustomFormatType.PERCENT
        ) {
            // Drop number-only fields when leaving a numeric pill.
            setFormatFieldValue('round', undefined);
            setFormatFieldValue('separator', NumberSeparator.DEFAULT);
            setFormatFieldValue('prefix', undefined);
            setFormatFieldValue('suffix', undefined);
        }
        if (next !== CustomFormatType.CURRENCY) {
            setFormatFieldValue('currency', undefined);
        }
    };

    const handleDatePillChange = (next: DatePill) => {
        if (next === CustomFormatType.DEFAULT) {
            setFormatFieldValue('type', CustomFormatType.DEFAULT);
            setFormatFieldValue('custom', undefined);
        } else {
            setFormatFieldValue('type', CustomFormatType.CUSTOM);
        }
    };

    const handleBytesUnitChange = (value: 'si' | 'iec' | null) => {
        if (!value) return;
        setFormatFieldValue(
            'type',
            value === 'si'
                ? CustomFormatType.BYTES_SI
                : CustomFormatType.BYTES_IEC,
        );
        // Clear compact since SI/IEC compact values aren't interchangeable.
        setFormatFieldValue('compact', undefined);
    };

    if (!isFormatRowVisible(dataType)) {
        // String / Boolean — no format row, but keep the data-type Select so
        // the user can still switch back to a numeric/date type.
        return (
            <Stack gap="xs">
                <Group justify="space-between" align="center">
                    <Group gap="xs" className={classes.headerLabel}>
                        <Box className={classes.headerIcon}>
                            <MantineIcon icon={IconPalette} size="sm" />
                        </Box>
                        <Text size="sm" fw={600}>
                            Format
                        </Text>
                    </Group>
                    <Select
                        className={classes.dataTypeSelect}
                        value={dataType}
                        onChange={(value) =>
                            value &&
                            onDataTypeChange(value as TableCalculationType)
                        }
                        data={dataTypeOptions}
                        allowDeselect={false}
                        leftSection={
                            <MantineIcon
                                icon={selectedDataTypeMeta.icon}
                                size="sm"
                            />
                        }
                        renderOption={renderDataTypeOption}
                        checkIconPosition="right"
                        size="xs"
                    />
                </Group>
                <Text size="xs" c="dimmed">
                    {dataType === TableCalculationType.STRING
                        ? 'Strings render as-is.'
                        : 'Booleans render as true / false.'}
                </Text>
            </Stack>
        );
    }

    const isNumeric = dataType === TableCalculationType.NUMBER;

    return (
        <Box className={classes.root}>
            <Box className={classes.header}>
                <Group gap="xs" className={classes.headerLabel}>
                    <Box className={classes.headerIcon}>
                        <MantineIcon icon={IconPalette} size="sm" />
                    </Box>
                    <Text size="sm" fw={600}>
                        Format
                    </Text>
                </Group>
                <Select
                    className={classes.dataTypeSelect}
                    value={dataType}
                    onChange={(value) =>
                        value && onDataTypeChange(value as TableCalculationType)
                    }
                    data={dataTypeOptions}
                    allowDeselect={false}
                    leftSection={
                        <MantineIcon
                            icon={selectedDataTypeMeta.icon}
                            size="sm"
                        />
                    }
                    renderOption={renderDataTypeOption}
                    checkIconPosition="right"
                    size="xs"
                />
            </Box>

            <Box className={classes.pillRow}>
                {previewValue !== null && (
                    <Box className={classes.previewPill}>
                        <MantineIcon
                            icon={IconArrowBackUp}
                            size="sm"
                            className={classes.previewIcon}
                        />
                        <Text component="span" inherit>
                            {previewValue}
                        </Text>
                    </Box>
                )}
                {previewValue !== null && <Box className={classes.divider} />}
                {isNumeric ? (
                    <SegmentedControl
                        value={numericPill}
                        onChange={(value) =>
                            handleNumericPillChange(value as NumericPill)
                        }
                        data={numericPills}
                        size="xs"
                        classNames={{
                            root: classes.pillsControl,
                            indicator: classes.pillsControlIndicator,
                            label: classes.pillsControlLabel,
                            control: classes.pillsControlItem,
                        }}
                    />
                ) : (
                    <SegmentedControl
                        value={datePill}
                        onChange={(value) =>
                            handleDatePillChange(value as DatePill)
                        }
                        data={datePills}
                        size="xs"
                        classNames={{
                            root: classes.pillsControl,
                            indicator: classes.pillsControlIndicator,
                            label: classes.pillsControlLabel,
                            control: classes.pillsControlItem,
                        }}
                    />
                )}
            </Box>

            {isNumeric && format.type === CustomFormatType.NUMBER && (
                <>
                    <Box className={classes.subRow}>
                        <Box className={classes.subRowField}>
                            <Text className={classes.subRowFieldLabel}>
                                Decimals
                            </Text>
                            <NumberInput
                                className={classes.subRowInput}
                                size="xs"
                                min={0}
                                placeholder="Auto"
                                {...{
                                    ...formatInputProps('round'),
                                    onChange: (value) =>
                                        setFormatFieldValue(
                                            'round',
                                            value === '' ? undefined : value,
                                        ),
                                }}
                            />
                        </Box>
                        <Box className={classes.subRowField}>
                            <Text className={classes.subRowFieldLabel}>
                                Compact
                            </Text>
                            <Select
                                className={classes.subRowSelect}
                                size="xs"
                                clearable
                                placeholder="None"
                                data={compactSelectData}
                                value={compactValidValue}
                                onChange={(value) =>
                                    setFormatFieldValue(
                                        'compact',
                                        !value || !(value in CompactConfigMap)
                                            ? undefined
                                            : value,
                                    )
                                }
                            />
                        </Box>
                    </Box>
                    <Box className={classes.subRow}>
                        <Box className={classes.subRowField}>
                            <Text className={classes.subRowFieldLabel}>
                                Prefix
                            </Text>
                            <TextInput
                                className={classes.subRowText}
                                size="xs"
                                placeholder="e.g. $"
                                {...formatInputProps('prefix')}
                            />
                        </Box>
                        <Box className={classes.subRowField}>
                            <Text className={classes.subRowFieldLabel}>
                                Suffix
                            </Text>
                            <TextInput
                                className={classes.subRowText}
                                size="xs"
                                placeholder="e.g. km/h"
                                {...formatInputProps('suffix')}
                            />
                        </Box>
                        <Box className={classes.subRowField}>
                            <Text className={classes.subRowFieldLabel}>
                                Separator
                            </Text>
                            <Select
                                className={classes.subRowSelect}
                                size="xs"
                                data={separatorOptions}
                                {...formatInputProps('separator')}
                            />
                        </Box>
                    </Box>
                </>
            )}

            {isNumeric && format.type === CustomFormatType.CURRENCY && (
                <Box className={classes.subRow}>
                    <Box className={classes.subRowField}>
                        <Text className={classes.subRowFieldLabel}>
                            Currency
                        </Text>
                        <Select
                            className={classes.subRowCurrencySelect}
                            size="xs"
                            searchable
                            data={currencyOptions}
                            {...formatInputProps('currency')}
                        />
                    </Box>
                    <Box className={classes.subRowField}>
                        <Text className={classes.subRowFieldLabel}>
                            Decimals
                        </Text>
                        <NumberInput
                            className={classes.subRowInput}
                            size="xs"
                            min={0}
                            placeholder="Auto"
                            {...{
                                ...formatInputProps('round'),
                                onChange: (value) =>
                                    setFormatFieldValue(
                                        'round',
                                        value === '' ? undefined : value,
                                    ),
                            }}
                        />
                    </Box>
                    <Box className={classes.subRowField}>
                        <Text className={classes.subRowFieldLabel}>
                            Compact
                        </Text>
                        <Select
                            className={classes.subRowSelect}
                            size="xs"
                            clearable
                            placeholder="None"
                            data={compactSelectData}
                            value={compactValidValue}
                            onChange={(value) =>
                                setFormatFieldValue(
                                    'compact',
                                    !value || !(value in CompactConfigMap)
                                        ? undefined
                                        : value,
                                )
                            }
                        />
                    </Box>
                </Box>
            )}

            {isNumeric && format.type === CustomFormatType.PERCENT && (
                <Box className={classes.subRow}>
                    <Box className={classes.subRowField}>
                        <Text className={classes.subRowFieldLabel}>
                            Decimals
                        </Text>
                        <NumberInput
                            className={classes.subRowInput}
                            size="xs"
                            min={0}
                            placeholder="Auto"
                            {...{
                                ...formatInputProps('round'),
                                onChange: (value) =>
                                    setFormatFieldValue(
                                        'round',
                                        value === '' ? undefined : value,
                                    ),
                            }}
                        />
                    </Box>
                </Box>
            )}

            {isNumeric && isBytes && (
                <Box className={classes.subRow}>
                    <Box className={classes.subRowField}>
                        <Text className={classes.subRowFieldLabel}>
                            Unit system
                        </Text>
                        <Select
                            className={classes.subRowSelect}
                            size="xs"
                            data={bytesUnitOptions}
                            value={
                                format.type === CustomFormatType.BYTES_IEC
                                    ? 'iec'
                                    : 'si'
                            }
                            onChange={(value) =>
                                handleBytesUnitChange(value as 'si' | 'iec')
                            }
                            allowDeselect={false}
                        />
                    </Box>
                    <Box className={classes.subRowField}>
                        <Text className={classes.subRowFieldLabel}>
                            Compact
                        </Text>
                        <Select
                            className={classes.subRowSelect}
                            size="xs"
                            clearable
                            placeholder="None"
                            data={compactSelectData}
                            value={compactValidValue}
                            onChange={(value) =>
                                setFormatFieldValue(
                                    'compact',
                                    !value || !(value in CompactConfigMap)
                                        ? undefined
                                        : value,
                                )
                            }
                        />
                    </Box>
                </Box>
            )}

            {isNumeric && format.type === CustomFormatType.CUSTOM && (
                <Box className={classes.customExpression}>
                    <TextInput
                        size="xs"
                        label="Format expression"
                        placeholder="e.g. #,##0.00"
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
                                    Build your format at customformats.com
                                </Anchor>
                            </Group>
                        }
                        {...formatInputProps('custom')}
                    />
                </Box>
            )}

            {!isNumeric && datePill === CustomFormatType.CUSTOM && (
                <DateFormatBody
                    format={format}
                    formatInputProps={formatInputProps}
                    setFormatFieldValue={setFormatFieldValue}
                    isTimestamp={dataType === TableCalculationType.TIMESTAMP}
                />
            )}
        </Box>
    );
};

const DateFormatBody: FC<{
    format: CustomFormat;
    formatInputProps: Props['formatInputProps'];
    setFormatFieldValue: Props['setFormatFieldValue'];
    isTimestamp: boolean;
}> = ({ format, formatInputProps, setFormatFieldValue, isTimestamp }) => {
    const presets = isTimestamp ? TIMESTAMP_FORMATS : DATE_FORMATS;
    const sample = useMemo(() => new Date(), []);
    const examples = useMemo(
        () =>
            presets.map((fmt) => ({
                format: fmt,
                example: formatValueWithExpression(fmt, sample),
            })),
        [presets, sample],
    );

    return (
        <Box className={classes.dateBody}>
            <TextInput
                size="xs"
                label="Custom format"
                placeholder="e.g. dd/mm/yyyy or mmmm d, yyyy"
                leftSection={
                    <MantineIcon
                        icon={isTimestamp ? IconClockHour4 : IconCalendar}
                        size="sm"
                    />
                }
                {...formatInputProps('custom')}
            />
            <Stack gap={4} mt="xs">
                <Group gap="xs">
                    <Text size="xs" c="ldGray.6" fw={500}>
                        Common formats
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
                <Box className={classes.dateExamplesRow}>
                    {examples.map(({ format: fmt, example }) => (
                        <PolymorphicPaperButton
                            key={fmt}
                            withBorder
                            p="xs"
                            shadow="none"
                            radius="md"
                            onClick={() => setFormatFieldValue('custom', fmt)}
                        >
                            <Text size="xs" c="ldDark.8" fw={500}>
                                {example}
                            </Text>
                            <Text size="xs" c="ldGray.5">
                                {fmt}
                            </Text>
                        </PolymorphicPaperButton>
                    ))}
                </Box>
            </Stack>
            {format.custom && (
                <Text size="xs" c="ldGray.6" mt="xs">
                    Preview:{' '}
                    <Text span fw={600} c="inherit">
                        {(() => {
                            try {
                                return formatValueWithExpression(
                                    format.custom,
                                    sample,
                                );
                            } catch {
                                return 'Invalid format';
                            }
                        })()}
                    </Text>
                </Text>
            )}
        </Box>
    );
};
