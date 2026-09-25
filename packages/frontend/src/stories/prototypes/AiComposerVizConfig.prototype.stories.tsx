// PROTOTYPE — throwaway. Three variants of the composer viz config panel (ZAP-1136), one story each. All state in memory.
import {
    Badge,
    Box,
    Button,
    Collapse,
    Divider,
    Group,
    Popover,
    SimpleGrid,
    Tabs,
    UnstyledButton,
    ScrollArea,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { type Meta, type StoryObj } from '@storybook/react-vite';
import {
    IconAdjustmentsHorizontal,
    IconChevronRight,
} from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState, type FC, type ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { getChartIcon } from '../../components/common/ResourceIcon/utils';
import styles from './AiComposerVizConfig.prototype.module.css';
import {
    AggSelect,
    AxisLabelInput,
    ChartPreview,
    ConfigSwitch,
    Frame,
    KindSwitcher,
    SortSelect,
    SplitSelect,
    XSelect,
    YSelect,
    type ConfigProps,
} from './vizConfigPrototypeParts';
import {
    AGG_SYMBOL,
    applies,
    INITIAL_CONFIG,
    KINDS,
    summarize,
    type VizConfig,
} from './vizConfigPrototypeSpec';

const useConfig = (initial: VizConfig = INITIAL_CONFIG) => {
    const [config, setConfig] = useState(initial);
    const onChange = (patch: Partial<VizConfig>) =>
        setConfig((c) => ({ ...c, ...patch }));
    return { config, setConfig, onChange };
};

/* ---------------- Bar ---------------- */

type BarTab = 'chart' | 'data' | 'display';

// Disabled controls say why on hover.
const DisabledReason: FC<{ reason: string | null; children: ReactNode }> = ({
    reason,
    children,
}) => (
    <Tooltip label={reason} disabled={!reason} withinPortal>
        <Box>{children}</Box>
    </Tooltip>
);

const TabNote: FC<{ children: ReactNode }> = ({ children }) => (
    <Text size="xs" c="dimmed">
        {children}
    </Text>
);

const TabIntro: FC<{ title: string; description: string }> = ({
    title,
    description,
}) => (
    <Stack gap={2}>
        <Title order={6} c="ldGray.7" size="sm" fw={500}>
            {title}
        </Title>
        <Text size="xs" c="dimmed">
            {description}
        </Text>
    </Stack>
);

const ChartTab: FC<ConfigProps> = (p) => (
    <Stack gap="md">
        <TabIntro title="Chart type" description="How the result is drawn." />
        <SimpleGrid cols={5} spacing="xs">
            {KINDS.map(({ kind, chartKind, label }) => (
                <UnstyledButton
                    key={kind}
                    className={styles.kindTile}
                    data-selected={p.config.kind === kind}
                    aria-pressed={p.config.kind === kind}
                    onClick={() => p.onChange({ kind })}
                >
                    <MantineIcon icon={getChartIcon(chartKind)} size={20} />
                    <Text component="span" fz="xs">
                        {label}
                    </Text>
                </UnstyledButton>
            ))}
        </SimpleGrid>
        {applies(p.config.kind).stack && (
            <>
                <Divider />
                <ConfigSwitch
                    {...p}
                    field="stack"
                    label="Stack series"
                    description="Pile split series on top of each other."
                />
            </>
        )}
    </Stack>
);

const DataTab: FC<ConfigProps> = (p) => {
    const { kind } = p.config;
    if (kind === 'table') {
        return <TabNote>Tables show every column of the result.</TabNote>;
    }
    const value = (
        <Group gap="xs" grow wrap="nowrap" align="flex-start">
            <YSelect {...p} label="Value" />
            <AggSelect {...p} label="Aggregation" />
        </Group>
    );
    if (kind === 'big_number') {
        return (
            <Stack gap="sm">
                <TabNote>A big value shows one number over all rows.</TabNote>
                <SimpleGrid cols={2} spacing="md">
                    {value}
                </SimpleGrid>
            </Stack>
        );
    }
    return (
        <SimpleGrid cols={2} spacing="md" verticalSpacing="sm">
            <XSelect {...p} label={kind === 'pie' ? 'Slices' : 'X axis'} />
            {value}
            <DisabledReason
                reason={
                    applies(kind).split ? null : 'Pie charts have one series'
                }
            >
                <SplitSelect {...p} label="Split series by" />
            </DisabledReason>
            <SortSelect {...p} label="Sort" />
        </SimpleGrid>
    );
};

const DisplayTab: FC<ConfigProps> = (p) =>
    applies(p.config.kind).display ? (
        <SimpleGrid cols={2} spacing="md" verticalSpacing="sm">
            <Stack gap="sm" pt={4}>
                <ConfigSwitch {...p} field="legend" label="Legend" />
                <ConfigSwitch {...p} field="valueLabels" label="Value labels" />
            </Stack>
            <Stack gap="sm">
                <AxisLabelInput {...p} field="xLabel" label="X axis label" />
                <AxisLabelInput {...p} field="yLabel" label="Y axis label" />
            </Stack>
        </SimpleGrid>
    ) : (
        <TabNote>Display options apply to bar and line charts.</TabNote>
    );

const BarVariant: FC<{ defaultOpen?: boolean; defaultTab?: BarTab }> = ({
    defaultOpen = false,
    defaultTab = 'chart',
}) => {
    const { config, onChange } = useConfig();
    const [open, setOpen] = useState(defaultOpen);
    const [queriesOpen, setQueriesOpen] = useState(false);
    const [pipelineKey, setPipelineKey] = useState(0);
    const toggleChart = () => {
        if (!open && queriesOpen) {
            setQueriesOpen(false);
            setPipelineKey((k) => k + 1);
        }
        setOpen(!open);
    };
    const [tab, setTab] = useState<BarTab>(defaultTab);
    const p = { config, onChange };
    const kind = KINDS.find((k) => k.kind === config.kind)!;
    return (
        <Frame
            pipelineKey={pipelineKey}
            onQueriesToggle={(opening) => {
                setQueriesOpen(opening);
                if (opening) setOpen(false);
            }}
        >
            <Box className={styles.chartArea}>
                <ChartPreview config={config} />
            </Box>
            <UnstyledButton
                className={styles.bar}
                aria-expanded={open}
                onClick={toggleChart}
            >
                <Box className={styles.barToggle}>
                    <MantineIcon
                        icon={IconChevronRight}
                        size={11}
                        stroke={1.6}
                        className={clsx(
                            styles.chevron,
                            open && styles.chevronOpen,
                        )}
                    />
                    <Text component="span" className={styles.heading}>
                        Chart
                    </Text>
                </Box>
                <Box className={styles.spacer} />
                <MantineIcon
                    icon={getChartIcon(kind.chartKind)}
                    size={14}
                    color="dimmed"
                />
                <Text component="span" className={styles.meta}>
                    {kind.label} · {summarize(config)}
                </Text>
            </UnstyledButton>
            <Collapse expanded={open}>
                <Tabs
                    value={tab}
                    onChange={(v) =>
                        setTab(v === 'data' || v === 'display' ? v : 'chart')
                    }
                    classNames={{ list: styles.tabList }}
                >
                    <Tabs.List>
                        <Tabs.Tab value="chart">Chart</Tabs.Tab>
                        <Tabs.Tab value="data">Data</Tabs.Tab>
                        <Tabs.Tab value="display">Display</Tabs.Tab>
                    </Tabs.List>
                    <ScrollArea.Autosize mah="45cqh" type="auto">
                        <Box p="md">
                            <Tabs.Panel value="chart">
                                <ChartTab {...p} />
                            </Tabs.Panel>
                            <Tabs.Panel value="data">
                                <DataTab {...p} />
                            </Tabs.Panel>
                            <Tabs.Panel value="display">
                                <DisplayTab {...p} />
                            </Tabs.Panel>
                        </Box>
                    </ScrollArea.Autosize>
                </Tabs>
            </Collapse>
        </Frame>
    );
};

/* ---------------- Toolbar ---------------- */

type ChipId = 'x' | 'y' | 'split' | 'display';

const Chip: FC<{
    id: ChipId;
    open: ChipId | null;
    setOpen: (id: ChipId | null) => void;
    disabled?: boolean;
    label: ReactNode;
    children: ReactNode;
}> = ({ id, open, setOpen, disabled, label, children }) => (
    <Popover
        opened={open === id}
        onChange={(o) => setOpen(o ? id : null)}
        position="bottom-start"
        shadow="md"
        withinPortal
        offset={6}
    >
        <Popover.Target>
            <Badge
                component="button"
                size="xs"
                color="gray"
                variant="light"
                className={styles.chip}
                data-open={open === id}
                data-disabled={disabled}
                style={{ textTransform: 'none', fontWeight: 400 }}
                onClick={() => !disabled && setOpen(open === id ? null : id)}
            >
                {label}
            </Badge>
        </Popover.Target>
        <Popover.Dropdown p="sm" w={240}>
            <Stack gap="xs">{children}</Stack>
        </Popover.Dropdown>
    </Popover>
);

const ToolbarVariant: FC<{ defaultOpen?: ChipId | null }> = ({
    defaultOpen = null,
}) => {
    const { config, onChange } = useConfig();
    const [open, setOpen] = useState<ChipId | null>(defaultOpen);
    const p = { config, onChange };
    const a = applies(config.kind);
    const [y] = config.y;
    return (
        <Frame>
            <Box className={styles.toolbar}>
                <KindSwitcher {...p} />
                <Box className={styles.divider} />
                <Chip
                    id="x"
                    open={open}
                    setOpen={setOpen}
                    disabled={!a.x}
                    label={
                        <>
                            <span className={styles.chipKey}>X</span>
                            {config.x ?? '—'}
                        </>
                    }
                >
                    <XSelect {...p} label="X axis" />
                    <SortSelect {...p} label="Sort" />
                </Chip>
                <Chip
                    id="y"
                    open={open}
                    setOpen={setOpen}
                    disabled={!a.y}
                    label={
                        <>
                            <span className={styles.chipKey}>Y</span>
                            {y
                                ? `${AGG_SYMBOL[y.aggregation]} ${y.reference}`
                                : '—'}
                        </>
                    }
                >
                    <YSelect {...p} label="Value" />
                    <AggSelect {...p} label="Aggregation" />
                </Chip>
                <Chip
                    id="split"
                    open={open}
                    setOpen={setOpen}
                    disabled={!a.split}
                    label={
                        <>
                            <span className={styles.chipKey}>Split</span>
                            {config.groupBy ?? 'none'}
                        </>
                    }
                >
                    <SplitSelect {...p} label="Split series by" />
                    <ConfigSwitch {...p} field="stack" label="Stack series" />
                </Chip>
                <Chip
                    id="display"
                    open={open}
                    setOpen={setOpen}
                    disabled={!a.display}
                    label="Display"
                >
                    <ConfigSwitch {...p} field="legend" label="Legend" />
                    <ConfigSwitch
                        {...p}
                        field="valueLabels"
                        label="Value labels"
                    />
                    <AxisLabelInput
                        {...p}
                        field="xLabel"
                        label="X axis label"
                    />
                    <AxisLabelInput
                        {...p}
                        field="yLabel"
                        label="Y axis label"
                    />
                </Chip>
            </Box>
            <Box className={styles.chartArea}>
                <ChartPreview config={config} />
            </Box>
        </Frame>
    );
};

/* ---------------- Drawer ---------------- */

const Subsection: FC<{
    title: string;
    description?: string;
    children: ReactNode;
}> = ({ title, description, children }) => (
    <Stack gap="sm">
        <Stack gap={2}>
            <Title order={6} c="ldGray.7" size="sm" fw={500}>
                {title}
            </Title>
            {description && (
                <Text size="xs" c="dimmed">
                    {description}
                </Text>
            )}
        </Stack>
        {children}
    </Stack>
);

const DrawerVariant: FC<{ defaultOpen?: boolean }> = ({
    defaultOpen = false,
}) => {
    const { config, onChange } = useConfig();
    const [saved, setSaved] = useState(config);
    const [open, setOpen] = useState(defaultOpen);
    const p = { config, onChange };
    const a = applies(config.kind);
    const dirty = saved !== config;
    return (
        <Frame
            headRight={
                <Button
                    size="compact-xs"
                    variant={open ? 'light' : 'subtle'}
                    color="gray"
                    leftSection={
                        <MantineIcon icon={IconAdjustmentsHorizontal} />
                    }
                    onClick={() => setOpen((o) => !o)}
                >
                    Configure
                </Button>
            }
        >
            <Box className={styles.drawerBody}>
                <Box className={styles.drawerChart}>
                    <ChartPreview config={config} />
                </Box>
                {open && (
                    <Box className={styles.drawer}>
                        <ScrollArea className={styles.drawerScroll}>
                            <Stack gap="md" p="md">
                                <Subsection
                                    title="Chart type"
                                    description="How the result is drawn."
                                >
                                    <KindSwitcher {...p} />
                                </Subsection>
                                <Divider />
                                <Subsection
                                    title="Data"
                                    description="Columns from the result of Revenue vs target."
                                >
                                    <XSelect
                                        {...p}
                                        variant="subtle"
                                        label="X axis"
                                    />
                                    <Group gap="xs" grow wrap="nowrap">
                                        <YSelect
                                            {...p}
                                            variant="subtle"
                                            label="Value"
                                        />
                                        <AggSelect
                                            {...p}
                                            variant="subtle"
                                            label="Aggregation"
                                        />
                                    </Group>
                                    <SplitSelect
                                        {...p}
                                        variant="subtle"
                                        label="Split series by"
                                    />
                                    <SortSelect
                                        {...p}
                                        variant="subtle"
                                        label="Sort"
                                    />
                                </Subsection>
                                <Divider />
                                <Subsection title="Display">
                                    <ConfigSwitch
                                        {...p}
                                        field="stack"
                                        label="Stack series"
                                    />
                                    <ConfigSwitch
                                        {...p}
                                        field="legend"
                                        label="Legend"
                                    />
                                    <ConfigSwitch
                                        {...p}
                                        field="valueLabels"
                                        label="Value labels"
                                    />
                                </Subsection>
                                <Divider />
                                <Subsection
                                    title="Axes"
                                    description={
                                        a.display
                                            ? 'Leave blank to use the column name.'
                                            : 'Not used by this chart type.'
                                    }
                                >
                                    <AxisLabelInput
                                        {...p}
                                        field="xLabel"
                                        variant="subtle"
                                        label="X axis label"
                                    />
                                    <AxisLabelInput
                                        {...p}
                                        field="yLabel"
                                        variant="subtle"
                                        label="Y axis label"
                                    />
                                </Subsection>
                            </Stack>
                        </ScrollArea>
                        <Box className={styles.drawerFooter}>
                            {dirty && (
                                <>
                                    <Box className={styles.dirtyDot} />
                                    <Text fz="xs" c="dimmed">
                                        Unsaved changes
                                    </Text>
                                </>
                            )}
                            <Box className={styles.spacer} />
                            <Button
                                size="compact-xs"
                                variant="default"
                                disabled={!dirty}
                                onClick={() => setSaved(config)}
                            >
                                Save
                            </Button>
                        </Box>
                    </Box>
                )}
            </Box>
        </Frame>
    );
};

/* ---------------- Stories ---------------- */

const meta: Meta = {
    title: 'Prototypes/Composer viz config',
    parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj;

export const Bar: Story = { render: () => <BarVariant /> };
export const Toolbar: Story = { render: () => <ToolbarVariant /> };
export const Drawer: Story = { render: () => <DrawerVariant /> };
