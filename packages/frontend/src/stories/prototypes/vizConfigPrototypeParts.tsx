// PROTOTYPE — throwaway shared pieces (frame, chart, controls) for the composer viz config stories.
import {
    ChartKind,
    QuerySourceType,
    VizAggregationOptions,
    VizIndexType,
    type AllVizChartConfig,
    type SourceQuery,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
    Group,
    ScrollArea,
    Select,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Tooltip,
    type SelectProps,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useEffect, useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { getChartIcon } from '../../components/common/ResourceIcon/utils';
import BigNumberView from '../../components/DataViz/visualizations/BigNumberView';
import ChartView from '../../components/DataViz/visualizations/ChartView';
import panelStyles from '../../ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.module.css';
import { AiComposerPipelinePanel } from '../../ee/features/aiCopilot/components/ChatElements/composerPipeline/AiComposerPipelinePanel';
import styles from './AiComposerVizConfig.prototype.module.css';
import {
    AGG_LABELS,
    applies,
    buildPrototypeSpec,
    COLUMNS,
    isNumeric,
    ROWS,
    type Kind,
    type PrototypeSpec,
    type VizConfig,
} from './vizConfigPrototypeSpec';

export type ConfigProps = {
    config: VizConfig;
    onChange: (patch: Partial<VizConfig>) => void;
};

const queries: SourceQuery[] = [
    {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'monthly_revenue',
        title: 'Monthly revenue by region',
        description: 'Governed revenue, orders and AOV per month and region.',
        exploreName: 'orders',
        dimensions: ['orders_order_month', 'customers_region'],
        metrics: [
            'orders_total_revenue',
            'orders_order_count',
            'orders_avg_order_value',
        ],
    },
    {
        sourceType: QuerySourceType.SQL,
        nodeId: 'region_targets',
        title: 'Region targets',
        description: 'Monthly revenue targets from the finance schema.',
        sql: 'SELECT region, month, target_revenue FROM finance.region_targets',
    },
    {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'revenue_vs_target',
        title: 'Revenue vs target',
        description: 'Joins actuals with targets per month and region.',
        sql: 'SELECT r.*, t.target_revenue FROM monthly_revenue AS r LEFT JOIN region_targets AS t USING (region, month)',
        references: ['monthly_revenue', 'region_targets'],
    },
];

/** Real floating panel chrome + real pipeline panel; children fill the results area. */
export const Frame: FC<{ headRight?: ReactNode; children: ReactNode }> = ({
    headRight,
    children,
}) => (
    <Box w={760} h={900}>
        <Box className={panelStyles.floatingPanel}>
            <Box
                className={clsx(
                    panelStyles.floatingContent,
                    panelStyles.flushContent,
                )}
            >
                <AiComposerPipelinePanel
                    projectUuid="story"
                    queries={queries}
                    terminalNodeId="revenue_vs_target"
                    displayedNodeId="revenue_vs_target"
                    displayableNodeIds={new Set(queries.map((q) => q.nodeId!))}
                    onDisplayNode={() => {}}
                    defaultExpanded={false}
                >
                    <Box className={styles.results}>
                        <Box
                            className={clsx(
                                panelStyles.head,
                                panelStyles.flushHead,
                            )}
                        >
                            <Stack gap={0} flex={1} miw={0}>
                                <Text fz="sm" fw={600}>
                                    Revenue by month and region
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    Semantic-layer revenue joined with finance
                                    targets, Jan–Jun 2026.
                                </Text>
                            </Stack>
                            <Group gap={2} className={panelStyles.headRight}>
                                {headRight}
                                <ActionIcon size="sm" aria-label="Close">
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            </Group>
                        </Box>
                        {children}
                    </Box>
                </AiComposerPipelinePanel>
            </Box>
        </Box>
    </Box>
);

const KINDS: { kind: Kind; chartKind: ChartKind; label: string }[] = [
    { kind: 'table', chartKind: ChartKind.TABLE, label: 'Table' },
    { kind: 'bar', chartKind: ChartKind.VERTICAL_BAR, label: 'Bar' },
    { kind: 'line', chartKind: ChartKind.LINE, label: 'Line' },
    { kind: 'pie', chartKind: ChartKind.PIE, label: 'Pie' },
    {
        kind: 'big_number',
        chartKind: ChartKind.BIG_NUMBER,
        label: 'Big number',
    },
];

export const KindSwitcher: FC<ConfigProps> = ({ config, onChange }) => (
    <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
        {KINDS.map(({ kind, chartKind, label }) => (
            <Tooltip key={kind} label={label} withinPortal openDelay={300}>
                <ActionIcon
                    size="sm"
                    variant={config.kind === kind ? 'light' : 'subtle'}
                    color={config.kind === kind ? 'indigo' : undefined}
                    aria-label={label}
                    aria-pressed={config.kind === kind}
                    onClick={() => onChange({ kind })}
                >
                    <MantineIcon icon={getChartIcon(chartKind)} size={14} />
                </ActionIcon>
            </Tooltip>
        ))}
    </Group>
);

const chartType = (kind: Kind): AllVizChartConfig['type'] =>
    kind === 'bar'
        ? ChartKind.VERTICAL_BAR
        : kind === 'pie'
          ? ChartKind.PIE
          : ChartKind.LINE;

/** Rebuilds the spec on every config change. */
export const ChartPreview: FC<{ config: VizConfig }> = ({ config }) => {
    const [built, setBuilt] = useState<{
        config: VizConfig;
        spec: PrototypeSpec;
    } | null>(null);
    useEffect(() => {
        let active = true;
        void buildPrototypeSpec(config).then((spec) => {
            if (active) setBuilt({ config, spec });
        });
        return () => {
            active = false;
        };
    }, [config]);
    const spec = built?.config === config ? built.spec : null;

    if (config.kind === 'table') {
        return (
            <ScrollArea h="100%">
                <Table fz="xs" highlightOnHover stickyHeader>
                    <Table.Thead>
                        <Table.Tr>
                            {COLUMNS.map((c) => (
                                <Table.Th
                                    key={c.reference}
                                    ta={
                                        isNumeric(c.reference)
                                            ? 'right'
                                            : undefined
                                    }
                                >
                                    {c.reference}
                                </Table.Th>
                            ))}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {ROWS.map((row, i) => (
                            <Table.Tr key={i}>
                                {COLUMNS.map((c) => (
                                    <Table.Td
                                        key={c.reference}
                                        ta={
                                            isNumeric(c.reference)
                                                ? 'right'
                                                : undefined
                                        }
                                    >
                                        {isNumeric(c.reference)
                                            ? Number(
                                                  row[c.reference],
                                              ).toLocaleString()
                                            : String(row[c.reference])}
                                    </Table.Td>
                                ))}
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </ScrollArea>
        );
    }
    if (spec?.kind === 'empty') {
        return (
            <Center h="100%">
                <Text fz="xs" c="dimmed">
                    {spec.reason}
                </Text>
            </Center>
        );
    }
    if (config.kind === 'big_number') {
        return (
            <BigNumberView
                spec={spec?.kind === 'big_number' ? spec.spec : undefined}
                isLoading={spec === null}
                hasValueField
            />
        );
    }
    return (
        <ChartView
            config={
                {
                    metadata: { version: 1 },
                    type: chartType(config.kind),
                    fieldConfig: {
                        x: config.x
                            ? {
                                  reference: config.x,
                                  type: VizIndexType.CATEGORY,
                              }
                            : undefined,
                        y: config.y,
                        groupBy: config.groupBy
                            ? [{ reference: config.groupBy }]
                            : [],
                    },
                    display: undefined,
                } as AllVizChartConfig
            }
            spec={spec?.kind === 'echarts' ? spec.option : undefined}
            isLoading={spec === null}
            style={{ height: '100%', width: '100%' }}
        />
    );
};

const NONE = '__none__';

type FieldProps = ConfigProps &
    Pick<SelectProps, 'variant' | 'label' | 'classNames' | 'comboboxProps'>;

const common = (p: FieldProps) => ({
    size: 'xs' as const,
    variant: p.variant,
    label: p.label,
    classNames: p.classNames,
    comboboxProps: { withinPortal: true, ...p.comboboxProps },
    allowDeselect: false,
});

export const XSelect: FC<FieldProps> = (p) => (
    <Select
        {...common(p)}
        disabled={!applies(p.config.kind).x}
        data={COLUMNS.map((c) => c.reference)}
        value={p.config.x}
        onChange={(x) => p.onChange({ x })}
    />
);

export const YSelect: FC<FieldProps> = (p) => (
    <Select
        {...common(p)}
        disabled={!applies(p.config.kind).y}
        data={COLUMNS.filter((c) => isNumeric(c.reference)).map(
            (c) => c.reference,
        )}
        value={p.config.y[0]?.reference ?? null}
        onChange={(reference) =>
            reference &&
            p.onChange({
                y: [
                    {
                        reference,
                        aggregation:
                            p.config.y[0]?.aggregation ??
                            VizAggregationOptions.SUM,
                    },
                ],
            })
        }
    />
);

export const AggSelect: FC<FieldProps> = (p) => (
    <Select
        {...common(p)}
        disabled={!applies(p.config.kind).y}
        data={[
            VizAggregationOptions.SUM,
            VizAggregationOptions.AVERAGE,
            VizAggregationOptions.MIN,
            VizAggregationOptions.MAX,
            VizAggregationOptions.COUNT,
            VizAggregationOptions.ANY,
        ].map((value) => ({ value, label: AGG_LABELS[value] }))}
        value={p.config.y[0]?.aggregation ?? null}
        onChange={(value) => {
            const agg = Object.values(VizAggregationOptions).find(
                (a) => a === value,
            );
            const [first] = p.config.y;
            if (agg && first)
                p.onChange({ y: [{ ...first, aggregation: agg }] });
        }}
    />
);

export const SplitSelect: FC<FieldProps> = (p) => (
    <Select
        {...common(p)}
        disabled={!applies(p.config.kind).split}
        data={[
            { value: NONE, label: 'None' },
            ...COLUMNS.filter((c) => !isNumeric(c.reference)).map((c) => ({
                value: c.reference,
                label: c.reference,
            })),
        ]}
        value={p.config.groupBy ?? NONE}
        onChange={(v) => p.onChange({ groupBy: v === NONE ? null : v })}
    />
);

export const SortSelect: FC<FieldProps> = (p) => (
    <Select
        {...common(p)}
        disabled={!applies(p.config.kind).sort}
        data={[
            { value: 'none', label: 'X axis order' },
            { value: 'value_desc', label: 'Value, high → low' },
        ]}
        value={p.config.sort}
        onChange={(v) =>
            p.onChange({ sort: v === 'value_desc' ? 'value_desc' : 'none' })
        }
    />
);

type ToggleKey = 'stack' | 'legend' | 'valueLabels';

export const ConfigSwitch: FC<
    ConfigProps & { field: ToggleKey; label?: string }
> = ({ config, onChange, field, label }) => (
    <Switch
        size="xs"
        label={label}
        disabled={
            field === 'stack'
                ? !applies(config.kind).stack
                : !applies(config.kind).display
        }
        checked={config[field]}
        onChange={(e) => onChange({ [field]: e.currentTarget.checked })}
    />
);

export const AxisLabelInput: FC<
    ConfigProps & {
        field: 'xLabel' | 'yLabel';
        variant?: string;
        label?: string;
        className?: string;
    }
> = ({ config, onChange, field, variant, label, className }) => (
    <TextInput
        size="xs"
        variant={variant}
        label={label}
        classNames={className ? { input: className } : undefined}
        disabled={!applies(config.kind).display}
        placeholder={
            field === 'xLabel'
                ? (config.x ?? 'X axis')
                : (config.y[0]?.reference ?? 'Y axis')
        }
        value={config[field]}
        onChange={(e) => onChange({ [field]: e.currentTarget.value })}
    />
);
