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
    ActionIcon,
    Anchor,
    Box,
    Button,
    Group,
    Menu,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
    type ComboboxItem,
} from '@mantine-8/core';
import { NumberInput } from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import {
    Icon123,
    IconAbc,
    IconArrowRight,
    IconCalendar,
    IconChevronDown,
    IconClockHour4,
    IconExternalLink,
    IconToggleLeft,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { type ValueOf } from 'type-fest';
import MantineIcon from '../../../../components/common/MantineIcon';
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
        label: `${c} (${formatter.format(1234.56).replace(/ /, ' ')})`,
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
        if (dataType === TableCalculationType.BOOLEAN) {
            return 'true';
        }
        if (dataType === TableCalculationType.STRING) {
            return 'Sample text';
        }
        if (isDateLike(dataType)) {
            const sample = new Date();
            if (
                format.type === CustomFormatType.CUSTOM &&
                format.custom &&
                format.custom.trim().length > 0
            ) {
                return formatValueWithExpression(format.custom, sample);
            }
            // Default Date / Timestamp rendering
            return dataType === TableCalculationType.TIMESTAMP
                ? sample.toLocaleString()
                : sample.toLocaleDateString();
        }

        const expression = convertCustomFormatToFormatExpression(format);
        if (!expression) {
            // Plain — show the raw sample with grouping so it reads cleanly.
            return new Intl.NumberFormat(undefined, {
                maximumFractionDigits: 12,
            }).format(NUMERIC_SAMPLE);
        }
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

    const dataTypeSelect = (
        <Select
            className={classes.dataTypeSelect}
            value={dataType}
            onChange={(value) =>
                value && onDataTypeChange(value as TableCalculationType)
            }
            data={dataTypeOptions}
            allowDeselect={false}
            leftSection={
                <MantineIcon icon={selectedDataTypeMeta.icon} size="sm" />
            }
            renderOption={renderDataTypeOption}
            checkIconPosition="right"
            size="xs"
        />
    );

    const isNumeric = dataType === TableCalculationType.NUMBER;
    const isPlainNumeric =
        isNumeric && numericPill === CustomFormatType.DEFAULT;

    const headerRow = (
        <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap="md" align="center" wrap="nowrap">
                <Text size="sm" fw={600}>
                    Format
                </Text>
                {dataTypeSelect}
            </Group>
            {previewValue !== null && (
                <Group gap={6} wrap="nowrap" className={classes.preview}>
                    <MantineIcon
                        icon={IconArrowRight}
                        size="sm"
                        className={classes.previewArrow}
                    />
                    <Text className={classes.previewValue}>{previewValue}</Text>
                </Group>
            )}
        </Group>
    );

    if (
        dataType === TableCalculationType.STRING ||
        dataType === TableCalculationType.BOOLEAN
    ) {
        // Strings / Booleans render as-is. Slim card — no pills/divider —
        // since there's nothing to choose.
        return (
            <Stack gap={2}>
                {headerRow}
                <Box className={`${classes.card} ${classes.cardEmpty}`}>
                    <Box className={classes.emptyBody}>
                        <Text size="xs" c="dimmed" fs="italic">
                            No formatting options for this type
                        </Text>
                    </Box>
                </Box>
            </Stack>
        );
    }

    const pills = isNumeric ? numericPills : datePills;
    const activePillValue: string = isNumeric ? numericPill : datePill;
    const onPillClick = (value: string) => {
        if (isNumeric) {
            handleNumericPillChange(value as NumericPill);
        } else {
            handleDatePillChange(value as DatePill);
        }
    };

    return (
        <Stack gap={2}>
            {headerRow}
            <Box className={classes.card}>
                <Box className={classes.topRow}>
                    <Group gap={6} wrap="wrap" className={classes.pillsGroup}>
                        {pills.map((p) => {
                            const isActive = activePillValue === p.value;
                            return (
                                <Button
                                    key={p.value}
                                    size="compact-xs"
                                    radius="md"
                                    variant={isActive ? 'filled' : 'default'}
                                    color={isActive ? 'blue' : undefined}
                                    onClick={() => onPillClick(p.value)}
                                    className={classes.pillButton}
                                >
                                    {p.label}
                                </Button>
                            );
                        })}
                    </Group>
                </Box>

                <Box className={classes.divider} />

                <Box className={classes.subBody}>
                    {isPlainNumeric && (
                        <Text size="xs" c="dimmed" fs="italic">
                            No further options for this preset
                        </Text>
                    )}

                    {isNumeric && format.type === CustomFormatType.NUMBER && (
                        <Group gap="md" wrap="wrap" align="flex-end">
                            <NumberInput
                                className={classes.subFieldInputNarrow}
                                size="xs"
                                radius="md"
                                min={0}
                                label="Decimals"
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
                            <Select
                                className={classes.subFieldSelectNarrow}
                                size="xs"
                                clearable
                                label="Compact"
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
                            <TextInput
                                className={classes.subFieldTextNarrow}
                                size="xs"
                                label="Prefix"
                                placeholder="$"
                                {...formatInputProps('prefix')}
                            />
                            <TextInput
                                className={classes.subFieldTextNarrow}
                                size="xs"
                                label="Suffix"
                                placeholder="km/h"
                                {...formatInputProps('suffix')}
                            />
                            <Select
                                className={classes.subFieldSeparator}
                                size="xs"
                                label="Separator"
                                data={separatorOptions}
                                {...formatInputProps('separator')}
                            />
                        </Group>
                    )}

                    {isNumeric && format.type === CustomFormatType.CURRENCY && (
                        <Group gap="md" wrap="wrap" align="flex-end">
                            <Select
                                className={classes.subFieldCurrency}
                                size="xs"
                                searchable
                                label="Currency"
                                placeholder="Pick a currency"
                                data={currencyOptions}
                                {...formatInputProps('currency')}
                            />
                            <NumberInput
                                className={classes.subFieldInput}
                                size="xs"
                                radius="md"
                                min={0}
                                label="Decimals"
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
                            <Select
                                className={classes.subFieldSelect}
                                size="xs"
                                clearable
                                label="Compact"
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
                        </Group>
                    )}

                    {isNumeric && format.type === CustomFormatType.PERCENT && (
                        <NumberInput
                            className={classes.subFieldInput}
                            size="xs"
                            radius="md"
                            min={0}
                            label="Decimals"
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
                    )}

                    {isNumeric && isBytes && (
                        <Group gap="md" wrap="wrap" align="flex-end">
                            <Select
                                className={classes.subFieldSelect}
                                size="xs"
                                label="Unit system"
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
                            <Select
                                className={classes.subFieldSelect}
                                size="xs"
                                clearable
                                label="Compact"
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
                        </Group>
                    )}

                    {isNumeric && format.type === CustomFormatType.CUSTOM && (
                        <TextInput
                            size="xs"
                            radius="md"
                            placeholder="e.g. #,##0.00"
                            label={
                                <Group
                                    justify="space-between"
                                    align="baseline"
                                    w="100%"
                                    gap={6}
                                >
                                    <Text size="xs" fw={500} c="ldGray.7">
                                        Format expression
                                    </Text>
                                    <Anchor
                                        href="https://customformats.com"
                                        target="_blank"
                                        size="xs"
                                        className={classes.labelLink}
                                    >
                                        <Group gap={4} wrap="nowrap">
                                            <MantineIcon
                                                icon={IconExternalLink}
                                                size="sm"
                                            />
                                            Build at customformats.com
                                        </Group>
                                    </Anchor>
                                </Group>
                            }
                            classNames={{ label: classes.fullWidthLabel }}
                            {...formatInputProps('custom')}
                        />
                    )}

                    {!isNumeric && datePill === CustomFormatType.DEFAULT && (
                        <Text size="xs" c="dimmed" fs="italic">
                            No further options for this preset
                        </Text>
                    )}

                    {!isNumeric && datePill === CustomFormatType.CUSTOM && (
                        <DateFormatBody
                            formatInputProps={formatInputProps}
                            setFormatFieldValue={setFormatFieldValue}
                            isTimestamp={
                                dataType === TableCalculationType.TIMESTAMP
                            }
                        />
                    )}
                </Box>
            </Box>
        </Stack>
    );
};

const DateFormatBody: FC<{
    formatInputProps: Props['formatInputProps'];
    setFormatFieldValue: Props['setFormatFieldValue'];
    isTimestamp: boolean;
}> = ({ formatInputProps, setFormatFieldValue, isTimestamp }) => {
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
        <TextInput
            size="xs"
            radius="md"
            placeholder="e.g. dd/mm/yyyy or mmmm d, yyyy"
            label={
                <Group
                    justify="space-between"
                    align="baseline"
                    w="100%"
                    gap={6}
                >
                    <Text size="xs" fw={500} c="ldGray.7">
                        {isTimestamp ? 'Timestamp format' : 'Date format'}
                    </Text>
                    <Anchor
                        href="https://customformats.com"
                        target="_blank"
                        size="xs"
                        className={classes.labelLink}
                    >
                        <Group gap={4} wrap="nowrap">
                            <MantineIcon icon={IconExternalLink} size="sm" />
                            Build at customformats.com
                        </Group>
                    </Anchor>
                </Group>
            }
            classNames={{ label: classes.fullWidthLabel }}
            leftSection={
                <MantineIcon
                    icon={isTimestamp ? IconClockHour4 : IconCalendar}
                    size="sm"
                />
            }
            rightSection={
                <Menu shadow="md" position="bottom-end" width={240}>
                    <Menu.Target>
                        <Tooltip label="Pick a preset" withArrow>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label="Pick a preset"
                            >
                                <MantineIcon icon={IconChevronDown} size="sm" />
                            </ActionIcon>
                        </Tooltip>
                    </Menu.Target>
                    <Menu.Dropdown>
                        {examples.map(({ format: fmt, example }) => (
                            <Menu.Item
                                key={fmt}
                                onClick={() =>
                                    setFormatFieldValue('custom', fmt)
                                }
                            >
                                <Stack gap={0}>
                                    <Text size="xs" fw={600} c="ldDark.8">
                                        {example}
                                    </Text>
                                    <Text size="xs" c="ldGray.5">
                                        {fmt}
                                    </Text>
                                </Stack>
                            </Menu.Item>
                        ))}
                    </Menu.Dropdown>
                </Menu>
            }
            {...formatInputProps('custom')}
        />
    );
};
