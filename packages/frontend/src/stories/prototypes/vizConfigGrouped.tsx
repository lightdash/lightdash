// PROTOTYPE — throwaway. Data tab with the SQL runner's grouped controls (pills inside field selects).
import { DimensionType, VizAggregationOptions } from '@lightdash/common';
import {
    ActionIcon,
    Group,
    Select,
    Stack,
    Text,
    Tooltip,
    type SelectProps,
} from '@mantine/core';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { TableFieldIcon } from '../../components/DataViz/Icons';
import styles from './AiComposerVizConfig.prototype.module.css';
import { type ConfigProps } from './vizConfigPrototypeParts';
import {
    AGG_LABELS,
    applies,
    COLUMNS,
    isNumeric,
    type VizConfig,
} from './vizConfigPrototypeSpec';

const typeOf = (reference: string | null) =>
    COLUMNS.find((c) => c.reference === reference)?.type ??
    DimensionType.STRING;

const FieldSelect: FC<SelectProps> = ({ value, ...props }) => (
    <Select
        size="xs"
        flex={1}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
        leftSection={<TableFieldIcon fieldType={typeOf(value ?? null)} />}
        classNames={{ input: styles.fieldInput, option: styles.fieldOption }}
        rightSectionWidth="min-content"
        rightSectionPointerEvents="all"
        value={value}
        {...props}
    />
);

const Pill: FC<{
    label: string;
    width: number;
    data: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
}> = ({ label, width, data, value, onChange }) => (
    <Tooltip label={label} withinPortal>
        <Select
            size="xs"
            w={width}
            aria-label={label}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true, position: 'bottom-end' }}
            classNames={{
                input: styles.pillInput,
                section: styles.pillSection,
                dropdown: styles.pillDropdown,
                option: styles.fieldOption,
            }}
            data={data}
            value={value}
            onChange={(v) => v && onChange(v)}
        />
    </Tooltip>
);

const Block: FC<{ title: string; action?: ReactNode; children: ReactNode }> = ({
    title,
    action,
    children,
}) => (
    <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
            <Text fw={500} fz="sm" c="ldGray.7">
                {title}
            </Text>
            {action}
        </Group>
        {children}
    </Stack>
);

const AGGS = [
    VizAggregationOptions.SUM,
    VizAggregationOptions.AVERAGE,
    VizAggregationOptions.MIN,
    VizAggregationOptions.MAX,
    VizAggregationOptions.COUNT,
    VizAggregationOptions.ANY,
];
const SHORT_AGG: Record<VizAggregationOptions, string> = {
    ...AGG_LABELS,
    [VizAggregationOptions.AVERAGE]: 'Avg',
};
const SORTS: { value: VizConfig['sort']; label: string }[] = [
    { value: 'none', label: 'X axis order' },
    { value: 'value_desc', label: 'Value ↓' },
    { value: 'value_asc', label: 'Value ↑' },
];
const NUMERIC = COLUMNS.filter((c) => isNumeric(c.reference)).map(
    (c) => c.reference,
);

export const GroupedDataTab: FC<ConfigProps> = ({ config, onChange }) => {
    const { kind } = config;
    if (kind === 'table') {
        return (
            <Text size="xs" c="dimmed">
                Tables show every column of the result.
            </Text>
        );
    }
    const a = applies(kind);
    const multiY = a.split;
    const ys = multiY ? config.y : config.y.slice(0, 1);
    const setY = (index: number, patch: Partial<VizConfig['y'][number]>) =>
        onChange({
            y: config.y.map((y, i) => (i === index ? { ...y, ...patch } : y)),
        });
    const unused = NUMERIC.find(
        (r) => !config.y.some((y) => y.reference === r),
    );

    return (
        <Stack gap="md">
            {a.x && (
                <Block title={kind === 'pie' ? 'Slices' : 'X axis'}>
                    <FieldSelect
                        placeholder="Select X axis"
                        data={COLUMNS.map((c) => c.reference)}
                        value={config.x}
                        onChange={(x) => onChange({ x })}
                        rightSection={
                            <Pill
                                label="Sort"
                                width={config.sort === 'none' ? 92 : 64}
                                data={SORTS}
                                value={config.sort}
                                onChange={(v) =>
                                    onChange({
                                        sort:
                                            SORTS.find((s) => s.value === v)
                                                ?.value ?? 'none',
                                    })
                                }
                            />
                        }
                    />
                </Block>
            )}
            <Block
                title="Y-axis"
                action={
                    multiY && (
                        <Tooltip label="Add Y axis" withinPortal>
                            <ActionIcon
                                size="sm"
                                aria-label="Add Y axis"
                                disabled={!unused}
                                onClick={() =>
                                    unused &&
                                    onChange({
                                        y: [
                                            ...config.y,
                                            {
                                                reference: unused,
                                                aggregation:
                                                    VizAggregationOptions.SUM,
                                            },
                                        ],
                                    })
                                }
                            >
                                <MantineIcon icon={IconPlus} />
                            </ActionIcon>
                        </Tooltip>
                    )
                }
            >
                {ys.map((y, index) => (
                    <Group key={index} gap="xs" wrap="nowrap">
                        <FieldSelect
                            placeholder="Select Y axis"
                            data={NUMERIC}
                            value={y.reference}
                            onChange={(reference) =>
                                reference && setY(index, { reference })
                            }
                            rightSection={
                                <Pill
                                    label="Aggregation"
                                    width={56}
                                    data={AGGS.map((agg) => ({
                                        value: agg,
                                        label: SHORT_AGG[agg],
                                    }))}
                                    value={y.aggregation}
                                    onChange={(v) => {
                                        const aggregation = AGGS.find(
                                            (agg) => agg === v,
                                        );
                                        if (aggregation)
                                            setY(index, { aggregation });
                                    }}
                                />
                            }
                        />
                        {ys.length > 1 && (
                            <Tooltip label="Remove Y axis" withinPortal>
                                <ActionIcon
                                    size="sm"
                                    aria-label="Remove Y axis"
                                    onClick={() =>
                                        onChange({
                                            y: config.y.filter(
                                                (_, i) => i !== index,
                                            ),
                                        })
                                    }
                                >
                                    <MantineIcon icon={IconMinus} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                ))}
                {config.groupBy && config.y.length > 1 && (
                    <Text size="xs" c="dimmed">
                        With a split, only the first Y axis is charted.
                    </Text>
                )}
            </Block>
            {a.split && (
                <Block title="Split series by">
                    <FieldSelect
                        clearable
                        allowDeselect
                        placeholder="Select a column"
                        data={COLUMNS.filter(
                            (c) => !isNumeric(c.reference),
                        ).map((c) => c.reference)}
                        value={config.groupBy}
                        onChange={(groupBy) => onChange({ groupBy })}
                    />
                </Block>
            )}
        </Stack>
    );
};
