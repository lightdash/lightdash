import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Code,
    Divider,
    Group,
    Paper,
    ScrollArea,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Textarea,
    UnstyledButton,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
    IconAdjustmentsHorizontal,
    IconAlertCircle,
    IconArrowLeft,
    IconArrowUp,
    IconChartArea,
    IconChartBar,
    IconChartDonut,
    IconChartDots,
    IconChartLine,
    IconChartPie,
    IconChartTreemap,
    IconChevronDown,
    IconChevronRight,
    IconCode,
    IconCircleCheck,
    IconDeviceFloppy,
    IconEdit,
    IconFilter,
    IconGauge,
    IconGitMerge,
    IconHistory,
    IconMap,
    IconPaperclip,
    IconPencil,
    IconPlayerPlay,
    IconPlus,
    IconRefresh,
    IconSearch,
    IconSettings,
    IconSparkles,
    IconSquareNumber1,
    IconTable,
    IconX,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import MantineIcon from '../components/common/MantineIcon';
import classes from './ExplorerChartGalleryPrototype.module.css';

// PROTOTYPE — complete Explorer -> embedded chart builder -> Explorer
// interaction. Throw this story away after the authoring layout and state model
// are chosen.

type QueryRow = {
    tier: 'Very high' | 'High' | 'Low';
    event: string;
    count: number;
};

type ExplorerMode = 'explore' | 'authoring';
type BuildStage = 'brief' | 'clarify' | 'building' | 'ready';
type ChartPreviewKind =
    | 'bar'
    | 'horizontal'
    | 'line'
    | 'area'
    | 'scatter'
    | 'donut'
    | 'funnel'
    | 'treemap'
    | 'gauge'
    | 'sankey'
    | 'map'
    | 'table'
    | 'scorecard'
    | 'vega';
type ChartGroup = 'Built in' | 'Project';
type ChartSource = 'standard' | 'vega' | 'project';

type ChartTypeOption = {
    id: string;
    label: string;
    description: string;
    group: ChartGroup;
    source: ChartSource;
    kind: ChartPreviewKind;
    icon: TablerIcon;
};

const QUERY_ROWS: QueryRow[] = [
    { tier: 'Very high', event: 'playlist_deleted', count: 354 },
    { tier: 'Very high', event: 'playlist_created', count: 329 },
    { tier: 'Very high', event: 'song_played', count: 322 },
    { tier: 'High', event: 'playlist_created', count: 315 },
    { tier: 'High', event: 'song_played', count: 300 },
    { tier: 'High', event: 'playlist_deleted', count: 285 },
    { tier: 'Low', event: 'playlist_created', count: 35 },
    { tier: 'Low', event: 'playlist_deleted', count: 35 },
    { tier: 'Low', event: 'song_played', count: 30 },
    { tier: 'Very high', event: '∅', count: 0 },
];

const TIER_ORDER: QueryRow['tier'][] = ['Very high', 'High', 'Low'];
const TOTAL = QUERY_ROWS.reduce((sum, row) => sum + row.count, 0);
const TIER_TOTALS = TIER_ORDER.map((tier) => ({
    tier,
    value: QUERY_ROWS.filter((row) => row.tier === tier).reduce(
        (sum, row) => sum + row.count,
        0,
    ),
}));

const CHART_TYPES: ChartTypeOption[] = [
    {
        id: 'bar',
        label: 'Bar chart',
        description: 'Compare categories',
        group: 'Built in',
        source: 'standard',
        kind: 'bar',
        icon: IconChartBar,
    },
    {
        id: 'horizontal-bar',
        label: 'Horizontal bar chart',
        description: 'Compare ranked categories',
        group: 'Built in',
        source: 'standard',
        kind: 'horizontal',
        icon: IconChartBar,
    },
    {
        id: 'line',
        label: 'Line chart',
        description: 'Show a trend',
        group: 'Built in',
        source: 'standard',
        kind: 'line',
        icon: IconChartLine,
    },
    {
        id: 'area',
        label: 'Area chart',
        description: 'Compare magnitude over time',
        group: 'Built in',
        source: 'standard',
        kind: 'area',
        icon: IconChartArea,
    },
    {
        id: 'scatter',
        label: 'Scatter chart',
        description: 'Find relationships and outliers',
        group: 'Built in',
        source: 'standard',
        kind: 'scatter',
        icon: IconChartDots,
    },
    {
        id: 'pie',
        label: 'Pie chart',
        description: 'Show part-to-whole',
        group: 'Built in',
        source: 'standard',
        kind: 'donut',
        icon: IconChartPie,
    },
    {
        id: 'funnel',
        label: 'Funnel chart',
        description: 'Show stage conversion',
        group: 'Built in',
        source: 'standard',
        kind: 'funnel',
        icon: IconFilter,
    },
    {
        id: 'treemap',
        label: 'Treemap',
        description: 'Show hierarchical proportions',
        group: 'Built in',
        source: 'standard',
        kind: 'treemap',
        icon: IconChartTreemap,
    },
    {
        id: 'gauge',
        label: 'Gauge',
        description: 'Track progress toward a target',
        group: 'Built in',
        source: 'standard',
        kind: 'gauge',
        icon: IconGauge,
    },
    {
        id: 'sankey',
        label: 'Sankey',
        description: 'Show flow between categories',
        group: 'Built in',
        source: 'standard',
        kind: 'sankey',
        icon: IconGitMerge,
    },
    {
        id: 'map',
        label: 'Map',
        description: 'Plot geographic values',
        group: 'Built in',
        source: 'standard',
        kind: 'map',
        icon: IconMap,
    },
    {
        id: 'table',
        label: 'Table',
        description: 'Show every result row',
        group: 'Built in',
        source: 'standard',
        kind: 'table',
        icon: IconTable,
    },
    {
        id: 'big-value',
        label: 'Big value',
        description: 'Highlight a single metric',
        group: 'Built in',
        source: 'standard',
        kind: 'scorecard',
        icon: IconSquareNumber1,
    },
    {
        id: 'vega',
        label: 'Vega (JSON editor)',
        description: 'Write Vega-Lite JSON by hand',
        group: 'Built in',
        source: 'vega',
        kind: 'vega',
        icon: IconCode,
    },
    {
        id: 'event-tier-pulse',
        label: 'Event tier pulse',
        description: 'Reusable ranked bars · 2 fields',
        group: 'Project',
        source: 'project',
        kind: 'horizontal',
        icon: IconChartBar,
    },
    {
        id: 'event-mix',
        label: 'Event mix',
        description: 'Branded distribution ring · 2 fields',
        group: 'Project',
        source: 'project',
        kind: 'donut',
        icon: IconChartDonut,
    },
    {
        id: 'volume-scorecard',
        label: 'Volume scorecard',
        description: 'KPI tile with target · 1 field',
        group: 'Project',
        source: 'project',
        kind: 'scorecard',
        icon: IconAdjustmentsHorizontal,
    },
    {
        id: 'generated-waterfall',
        label: 'Event change waterfall',
        description: 'Generated waterfall · 3 fields',
        group: 'Project',
        source: 'project',
        kind: 'bar',
        icon: IconChartBar,
    },
];

const PALETTES = {
    navy: '#213b60',
    blue: '#228be6',
    grape: '#7950f2',
    teal: '#0ca678',
} as const;

type Palette = keyof typeof PALETTES;

const ChartPreview = ({
    kind,
    palette,
    compact = false,
    showLabels = true,
}: {
    kind: ChartPreviewKind;
    palette: Palette;
    compact?: boolean;
    showLabels?: boolean;
}) => {
    const color = PALETTES[palette];
    const maxValue = Math.max(...TIER_TOTALS.map(({ value }) => value));
    const style = { '--chart-color': color } as CSSProperties;

    return (
        <Box
            className={`${classes.chartPreview} ${
                compact ? classes.miniPreview : ''
            }`}
            style={style}
        >
            {kind === 'bar' && (
                <Box className={classes.barChart}>
                    {TIER_TOTALS.map(({ tier, value }) => (
                        <Box
                            key={tier}
                            className={classes.barColumn}
                            style={{
                                height: `${Math.max(8, (value / maxValue) * 88)}%`,
                                background: color,
                            }}
                        >
                            {showLabels && (
                                <>
                                    <span className={classes.barValue}>
                                        {value.toLocaleString()}
                                    </span>
                                    <span className={classes.barLabel}>
                                        {tier}
                                    </span>
                                </>
                            )}
                        </Box>
                    ))}
                </Box>
            )}

            {kind === 'line' && (
                <svg
                    className={classes.lineChart}
                    viewBox="0 0 400 190"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Line chart preview"
                >
                    {[40, 85, 130, 175].map((y) => (
                        <line
                            key={y}
                            x1="20"
                            x2="385"
                            y1={y}
                            y2={y}
                            stroke="currentColor"
                            strokeOpacity="0.12"
                        />
                    ))}
                    <polyline
                        points="35,44 200,57 365,166"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="7"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                    {[
                        ['35', '44'],
                        ['200', '57'],
                        ['365', '166'],
                    ].map(([x, y]) => (
                        <circle
                            key={x}
                            cx={x}
                            cy={y}
                            r="7"
                            fill="currentColor"
                        />
                    ))}
                </svg>
            )}

            {kind === 'area' && (
                <svg
                    className={classes.lineChart}
                    viewBox="0 0 400 190"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Area chart preview"
                >
                    <defs>
                        <linearGradient
                            id="area-fill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0"
                                stopColor="currentColor"
                                stopOpacity="0.72"
                            />
                            <stop
                                offset="1"
                                stopColor="currentColor"
                                stopOpacity="0.12"
                            />
                        </linearGradient>
                    </defs>
                    <path
                        d="M20 176 L20 72 L125 42 L235 88 L380 28 L380 176 Z"
                        fill="url(#area-fill)"
                    />
                    <polyline
                        points="20,72 125,42 235,88 380,28"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="5"
                        strokeLinejoin="round"
                    />
                </svg>
            )}

            {kind === 'scatter' && (
                <svg
                    className={classes.lineChart}
                    viewBox="0 0 400 190"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Scatter chart preview"
                >
                    {[
                        [52, 135, 8],
                        [88, 112, 10],
                        [126, 128, 6],
                        [166, 82, 9],
                        [208, 94, 7],
                        [254, 56, 11],
                        [302, 72, 7],
                        [346, 34, 9],
                    ].map(([cx, cy, r]) => (
                        <circle
                            key={`${cx}-${cy}`}
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill="currentColor"
                            opacity="0.78"
                        />
                    ))}
                </svg>
            )}

            {kind === 'donut' && (
                <Box className={classes.donutLayout}>
                    <Box className={classes.donut} />
                    {!compact && (
                        <Stack gap={5}>
                            {TIER_TOTALS.map(({ tier, value }, index) => (
                                <Group key={tier} gap="xs">
                                    <Box
                                        w={9}
                                        h={9}
                                        style={{
                                            borderRadius: 2,
                                            background: color,
                                            opacity: 1 - index * 0.25,
                                        }}
                                    />
                                    <Text size="xs">
                                        {tier} · {value.toLocaleString()}
                                    </Text>
                                </Group>
                            ))}
                        </Stack>
                    )}
                </Box>
            )}

            {kind === 'scorecard' && (
                <Box className={classes.scorecard}>
                    <Text fw={700} fz={compact ? 24 : 48} style={{ color }}>
                        {TOTAL.toLocaleString()}
                    </Text>
                    <Text size={compact ? 'xs' : 'sm'} c="dimmed">
                        Total events
                    </Text>
                </Box>
            )}

            {kind === 'horizontal' && (
                <Box className={classes.horizontalBars}>
                    {TIER_TOTALS.map(({ tier, value }) => (
                        <Group key={tier} gap="xs" wrap="nowrap">
                            {!compact && (
                                <Text size="xs" w={58} ta="right">
                                    {tier}
                                </Text>
                            )}
                            <Box className={classes.horizontalTrack} flex={1}>
                                <Box
                                    className={classes.horizontalFill}
                                    style={{
                                        width: `${Math.max(5, (value / maxValue) * 100)}%`,
                                        background: color,
                                    }}
                                />
                            </Box>
                        </Group>
                    ))}
                </Box>
            )}

            {kind === 'funnel' && (
                <Stack
                    className={classes.funnel}
                    align="center"
                    justify="center"
                    gap={compact ? 4 : 9}
                >
                    {[100, 76, 48].map((width, index) => (
                        <Box
                            key={width}
                            h={compact ? 12 : 42}
                            style={{
                                width: `${width}%`,
                                background: color,
                                opacity: 1 - index * 0.22,
                                clipPath:
                                    'polygon(4% 0, 96% 0, 86% 100%, 14% 100%)',
                            }}
                        />
                    ))}
                </Stack>
            )}

            {kind === 'treemap' && (
                <Box className={classes.treemap}>
                    <Box style={{ background: color, gridArea: 'a' }} />
                    <Box
                        style={{
                            background: color,
                            opacity: 0.76,
                            gridArea: 'b',
                        }}
                    />
                    <Box
                        style={{
                            background: color,
                            opacity: 0.52,
                            gridArea: 'c',
                        }}
                    />
                    <Box
                        style={{
                            background: color,
                            opacity: 0.34,
                            gridArea: 'd',
                        }}
                    />
                </Box>
            )}

            {kind === 'gauge' && (
                <Box className={classes.gaugeWrap}>
                    <Box
                        className={classes.gauge}
                        style={{ borderColor: color }}
                    />
                    <Box
                        className={classes.gaugeNeedle}
                        style={{ background: color }}
                    />
                    {!compact && (
                        <Text fw={700} fz={28}>
                            78%
                        </Text>
                    )}
                </Box>
            )}

            {kind === 'sankey' && (
                <svg
                    className={classes.sankey}
                    viewBox="0 0 400 190"
                    preserveAspectRatio="none"
                    role="img"
                    aria-label="Sankey chart preview"
                >
                    <path
                        d="M50 48 C165 48 210 48 350 74"
                        stroke="currentColor"
                        strokeWidth="30"
                        opacity="0.46"
                        fill="none"
                    />
                    <path
                        d="M50 132 C160 132 230 118 350 116"
                        stroke="currentColor"
                        strokeWidth="22"
                        opacity="0.26"
                        fill="none"
                    />
                    <rect
                        x="38"
                        y="28"
                        width="18"
                        height="124"
                        rx="3"
                        fill="currentColor"
                    />
                    <rect
                        x="346"
                        y="44"
                        width="18"
                        height="94"
                        rx="3"
                        fill="currentColor"
                    />
                </svg>
            )}

            {kind === 'map' && (
                <Box className={classes.mapPreview}>
                    {[
                        ['18%', '28%', 11],
                        ['45%', '36%', 8],
                        ['68%', '24%', 13],
                        ['61%', '67%', 9],
                        ['31%', '72%', 6],
                    ].map(([left, top, size]) => (
                        <Box
                            key={`${left}-${top}`}
                            className={classes.mapDot}
                            style={{
                                left,
                                top,
                                width: size,
                                height: size,
                                background: color,
                            }}
                        />
                    ))}
                </Box>
            )}

            {kind === 'table' && (
                <Stack className={classes.tablePreview} gap={compact ? 4 : 8}>
                    {[100, 94, 82, 88, 70].map((width, index) => (
                        <Group
                            key={`${width}-${index}`}
                            gap={compact ? 4 : 8}
                            wrap="nowrap"
                        >
                            <Box
                                w="32%"
                                h={compact ? 5 : 12}
                                bg={index === 0 ? color : 'gray.2'}
                            />
                            <Box
                                w={`${width / 2}%`}
                                h={compact ? 5 : 12}
                                bg={index === 0 ? color : 'gray.2'}
                            />
                            <Box
                                flex={1}
                                h={compact ? 5 : 12}
                                bg={index === 0 ? color : 'gray.2'}
                            />
                        </Group>
                    ))}
                </Stack>
            )}

            {kind === 'vega' && (
                <Box className={classes.vegaPreview}>
                    <MantineIcon
                        icon={IconCode}
                        size={compact ? 22 : 42}
                        color="violet"
                    />
                    {!compact && (
                        <Stack gap={4}>
                            <Code>{'"mark": "bar"'}</Code>
                            <Code>{'"x": "event_tier"'}</Code>
                            <Code>{'"y": "count"'}</Code>
                        </Stack>
                    )}
                </Box>
            )}
        </Box>
    );
};

const FieldsSidebar = ({
    extraFieldSelected,
    queryDirty,
    dataRevision,
    authoring,
    onToggleExtraField,
    onRunQuery,
}: {
    extraFieldSelected: boolean;
    queryDirty: boolean;
    dataRevision: number;
    authoring: boolean;
    onToggleExtraField: () => void;
    onRunQuery: () => void;
}) => (
    <Box className={`${classes.sidebar} ${classes.leftSidebar}`}>
        <Group className={classes.sidebarHeader} justify="space-between">
            <Text fw={600}>Events</Text>
            <ActionIcon variant="subtle" color="gray" aria-label="Close fields">
                <MantineIcon icon={IconX} />
            </ActionIcon>
        </Group>
        <ScrollArea className={classes.sidebarScroll}>
            <Stack p="md" gap="lg">
                <TextInput
                    size="xs"
                    placeholder="Search fields"
                    leftSection={<MantineIcon icon={IconSearch} />}
                />
                <Stack gap="xs">
                    <Group justify="space-between">
                        <Text size="xs" fw={600} c="dimmed">
                            SELECTED FIELDS
                        </Text>
                        <Badge variant="light" size="xs">
                            {extraFieldSelected ? 4 : 3}
                        </Badge>
                    </Group>
                    {[
                        ['Abc', 'Event tier', 'blue'],
                        ['Abc', 'Event', 'blue'],
                        ['123', 'Count', 'orange'],
                        ...(extraFieldSelected
                            ? [['📅', 'Event date', 'grape']]
                            : []),
                    ].map(([type, label, color]) => (
                        <Group
                            key={label}
                            className={classes.fieldItem}
                            justify="space-between"
                        >
                            <Group gap="xs">
                                <Text size="xs" fw={700} c={color}>
                                    {type}
                                </Text>
                                <Text size="sm">{label}</Text>
                            </Group>
                            <Text c="dimmed" size="sm">
                                ⋮⋮
                            </Text>
                        </Group>
                    ))}
                </Stack>
                <Stack gap="xs">
                    <Text size="xs" fw={600} c="dimmed">
                        DIMENSIONS
                    </Text>
                    {['Event source', 'Event date', 'User id'].map((field) => {
                        const isInteractive = field === 'Event date';
                        const isSelected = isInteractive && extraFieldSelected;
                        return (
                            <Group key={field} justify="space-between" px="xs">
                                <Text size="sm">{field}</Text>
                                <Button
                                    size="compact-xs"
                                    variant={isSelected ? 'light' : 'subtle'}
                                    onClick={
                                        isInteractive
                                            ? onToggleExtraField
                                            : undefined
                                    }
                                >
                                    {isSelected ? 'Remove' : '+'}
                                </Button>
                            </Group>
                        );
                    })}
                </Stack>
                <Stack gap="xs">
                    <Text size="xs" fw={600} c="dimmed">
                        METRICS
                    </Text>
                    {['Unique users', 'Average count', 'Count of events'].map(
                        (field) => (
                            <Group key={field} justify="space-between" px="xs">
                                <Text size="sm">{field}</Text>
                                <Button size="compact-xs" variant="subtle">
                                    +
                                </Button>
                            </Group>
                        ),
                    )}
                </Stack>
                <Paper
                    withBorder
                    radius="md"
                    p="sm"
                    className={queryDirty ? classes.queryChanged : undefined}
                >
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Text size="xs" fw={600}>
                                QUERY CONTEXT
                            </Text>
                            <Badge
                                size="xs"
                                color={queryDirty ? 'yellow' : 'green'}
                                variant="light"
                            >
                                {queryDirty ? 'Changed' : `Run ${dataRevision}`}
                            </Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                            {queryDirty
                                ? 'Run the query to refresh the chart and builder preview.'
                                : authoring
                                  ? 'The builder is using these executed results.'
                                  : 'Chart previews use the latest executed results.'}
                        </Text>
                        <Button
                            fullWidth
                            size="xs"
                            color={queryDirty ? 'blue' : 'gray'}
                            variant={queryDirty ? 'filled' : 'default'}
                            leftSection={
                                <MantineIcon icon={IconPlayerPlay} size={14} />
                            }
                            onClick={onRunQuery}
                        >
                            {queryDirty ? 'Run updated query' : 'Run query'}
                        </Button>
                    </Stack>
                </Paper>
            </Stack>
        </ScrollArea>
    </Box>
);

const ConfigControls = ({
    selectedChart,
    palette,
    setPalette,
    showLabels,
    setShowLabels,
    onEditProjectChart,
}: {
    selectedChart: ChartTypeOption;
    palette: Palette;
    setPalette: (palette: Palette) => void;
    showLabels: boolean;
    setShowLabels: (show: boolean) => void;
    onEditProjectChart?: () => void;
}) => {
    const mappingLabels =
        selectedChart.id === 'volume-scorecard'
            ? [['Metric', 'Count']]
            : selectedChart.id === 'sankey'
              ? [
                    ['Source', 'Event tier'],
                    ['Target', 'Event'],
                    ['Weight', 'Count'],
                ]
              : selectedChart.id === 'map'
                ? [
                      ['Location', 'Event'],
                      ['Value', 'Count'],
                  ]
                : selectedChart.id === 'table'
                  ? [['Columns', 'Event tier, Event, Count']]
                  : [
                        ['Category', 'Event tier'],
                        ['Value', 'Count'],
                    ];

    const paletteControl = (
        <Stack gap={7}>
            <Text size="xs" fw={500}>
                Color palette
            </Text>
            <SegmentedControl
                fullWidth
                size="xs"
                value={palette}
                onChange={(value) => setPalette(value as Palette)}
                data={Object.entries(PALETTES).map(([value, color]) => ({
                    value,
                    label: (
                        <Box
                            w={16}
                            h={16}
                            mx="auto"
                            style={{ borderRadius: 4, background: color }}
                        />
                    ),
                }))}
            />
        </Stack>
    );

    if (selectedChart.source === 'vega') {
        return (
            <Stack gap="md">
                <Group justify="space-between">
                    <Stack gap={1}>
                        <Text size="sm" fw={600}>
                            Vega-Lite JSON
                        </Text>
                        <Text size="xs" c="dimmed">
                            Built in · edits this chart only
                        </Text>
                    </Stack>
                    <Button size="compact-xs" variant="default">
                        Templates
                    </Button>
                </Group>
                <Textarea
                    classNames={{ input: classes.vegaEditor }}
                    autosize
                    minRows={12}
                    defaultValue={`{
  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
  "mark": { "type": "bar", "cornerRadiusEnd": 4 },
  "encoding": {
    "x": { "field": "event_tier", "type": "nominal" },
    "y": { "field": "count", "type": "quantitative" },
    "color": { "value": "${PALETTES[palette]}" }
  }
}`}
                />
                {paletteControl}
            </Stack>
        );
    }

    return (
        <Stack gap="md">
            {selectedChart.source === 'project' && (
                <Paper withBorder radius="md" p="sm">
                    <Group
                        justify="space-between"
                        align="flex-start"
                        wrap="nowrap"
                    >
                        <Stack gap={2}>
                            <Group gap={6}>
                                <Text size="sm" fw={600}>
                                    {selectedChart.label}
                                </Text>
                                <Badge size="xs" variant="light" color="violet">
                                    Project
                                </Badge>
                            </Group>
                            <Text size="xs" c="dimmed">
                                {selectedChart.description}
                            </Text>
                        </Stack>
                        <Button
                            size="compact-xs"
                            variant="subtle"
                            leftSection={
                                <MantineIcon icon={IconEdit} size={13} />
                            }
                            onClick={onEditProjectChart}
                        >
                            Edit
                        </Button>
                    </Group>
                </Paper>
            )}

            <Stack gap="xs">
                <Text size="xs" fw={600} c="dimmed">
                    FIELD MAPPING
                </Text>
                {mappingLabels.map(([label, value]) => (
                    <Select
                        key={label}
                        label={label}
                        size="xs"
                        value={value}
                        data={[
                            'Event tier',
                            'Event',
                            'Count',
                            'Event tier, Event, Count',
                        ]}
                    />
                ))}
            </Stack>

            <Divider label="Display" labelPosition="left" />
            {paletteControl}
            <Group justify="space-between">
                <Text size="sm">Show value labels</Text>
                <Switch
                    size="sm"
                    checked={showLabels}
                    onChange={(event) =>
                        setShowLabels(event.currentTarget.checked)
                    }
                />
            </Group>
            {(selectedChart.id === 'bar' ||
                selectedChart.id === 'horizontal-bar' ||
                selectedChart.id === 'area') && (
                <Group justify="space-between">
                    <Text size="sm">Stack series</Text>
                    <Switch size="sm" />
                </Group>
            )}
            {selectedChart.source === 'project' && (
                <Select
                    label="Density"
                    size="xs"
                    value="Comfortable"
                    data={['Compact', 'Comfortable', 'Spacious']}
                />
            )}
        </Stack>
    );
};

const LegacyConfigSidebar = ({
    selectedId,
    setSelectedId,
    palette,
    setPalette,
    showLabels,
    setShowLabels,
}: {
    selectedId: string;
    setSelectedId: (id: string) => void;
    palette: Palette;
    setPalette: (palette: Palette) => void;
    showLabels: boolean;
    setShowLabels: (show: boolean) => void;
}) => (
    <Box className={`${classes.sidebar} ${classes.leftSidebar}`}>
        <Group className={classes.sidebarHeader} justify="space-between">
            <Text fw={600}>Configure chart</Text>
            <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Close configure"
            >
                <MantineIcon icon={IconX} />
            </ActionIcon>
        </Group>
        <ScrollArea className={classes.sidebarScroll}>
            <Stack p="md" gap="lg">
                <Group align="end">
                    <Select
                        flex={1}
                        label="Chart type"
                        value={
                            CHART_TYPES.find(({ id }) => id === selectedId)
                                ?.source === 'standard'
                                ? selectedId
                                : 'custom'
                        }
                        onChange={(value) => {
                            if (value === 'custom') {
                                setSelectedId('event-tier-pulse');
                            } else if (value) {
                                setSelectedId(value);
                            }
                        }}
                        data={[
                            ...CHART_TYPES.filter(
                                ({ source }) => source === 'standard',
                            ).map(({ id, label }) => ({ value: id, label })),
                            { value: 'custom', label: 'Custom' },
                        ]}
                    />
                </Group>
                {CHART_TYPES.find(({ id }) => id === selectedId)?.source !==
                    'standard' && (
                    <Select
                        label="Custom chart type"
                        placeholder="Search custom chart types…"
                        value={selectedId}
                        onChange={(value) => value && setSelectedId(value)}
                        data={[
                            {
                                group: 'Built in',
                                items: CHART_TYPES.filter(
                                    ({ source }) => source === 'vega',
                                ).map(({ id, label }) => ({
                                    value: id,
                                    label,
                                })),
                            },
                            {
                                group: 'Project',
                                items: CHART_TYPES.filter(
                                    ({ source }) => source === 'project',
                                ).map(({ id, label }) => ({
                                    value: id,
                                    label,
                                })),
                            },
                        ]}
                    />
                )}
                <Divider />
                <ConfigControls
                    selectedChart={
                        CHART_TYPES.find(({ id }) => id === selectedId) ??
                        CHART_TYPES[0]
                    }
                    palette={palette}
                    setPalette={setPalette}
                    showLabels={showLabels}
                    setShowLabels={setShowLabels}
                />
            </Stack>
        </ScrollArea>
    </Box>
);

const PrototypeState = ({
    selectedChart,
    palette,
    showLabels,
}: {
    selectedChart: ChartTypeOption;
    palette: Palette;
    showLabels: boolean;
}) => (
    <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed">
            PROTOTYPE STATE
        </Text>
        <Code block className={classes.stateBlock}>
            {JSON.stringify(
                {
                    featureFlag: 'new-explorer-chart-sidebar',
                    selectedChart: selectedChart.id,
                    source: selectedChart.source,
                    resultRows: QUERY_ROWS.length,
                    mappings: { category: 'Event tier', value: 'Count' },
                    palette,
                    showLabels,
                },
                null,
                2,
            )}
        </Code>
    </Stack>
);

type RightSidebarProps = {
    selectedChart: ChartTypeOption;
    setSelectedId: (id: string) => void;
    palette: Palette;
    setPalette: (palette: Palette) => void;
    showLabels: boolean;
    setShowLabels: (show: boolean) => void;
    onCreateChartType: () => void;
    onEditProjectChart: () => void;
};

const ChartGallerySidebar = ({
    selectedChart,
    setSelectedId,
    palette,
    setPalette,
    showLabels,
    setShowLabels,
    onCreateChartType,
    onEditProjectChart,
}: RightSidebarProps) => {
    const [step, setStep] = useState<'choose' | 'configure'>('choose');

    return (
        <ScrollArea className={classes.sidebarScroll}>
            <Stack p="md" gap="md">
                <SegmentedControl
                    fullWidth
                    value={step}
                    onChange={(value) => setStep(value as typeof step)}
                    data={[
                        { value: 'choose', label: '1 · Choose type' },
                        { value: 'configure', label: '2 · Configure' },
                    ]}
                />

                {step === 'choose' ? (
                    <>
                        <TextInput
                            size="xs"
                            placeholder="Search the gallery"
                            leftSection={<MantineIcon icon={IconSearch} />}
                        />
                        {(['Project', 'Built in'] as ChartGroup[]).map(
                            (chartGroup) => (
                                <Stack key={chartGroup} gap="xs">
                                    <Group justify="space-between">
                                        <Text size="xs" fw={600} c="dimmed">
                                            {chartGroup.toUpperCase()}
                                        </Text>
                                        {chartGroup === 'Project' && (
                                            <Badge size="xs" variant="light">
                                                Uses these results
                                            </Badge>
                                        )}
                                    </Group>
                                    {CHART_TYPES.filter(
                                        ({ group }) => group === chartGroup,
                                    ).map((chart) => (
                                        <UnstyledButton
                                            key={chart.id}
                                            className={`${classes.catalogRow} ${
                                                chart.id === selectedChart.id
                                                    ? classes.catalogRowSelected
                                                    : ''
                                            }`}
                                            onClick={() => {
                                                setSelectedId(chart.id);
                                                setStep('configure');
                                            }}
                                        >
                                            <Group wrap="nowrap" align="center">
                                                <Box
                                                    className={
                                                        classes.catalogThumbnail
                                                    }
                                                >
                                                    <ChartPreview
                                                        kind={chart.kind}
                                                        palette={palette}
                                                        compact
                                                    />
                                                </Box>
                                                <Stack gap={2} flex={1}>
                                                    <Text size="sm" fw={600}>
                                                        {chart.label}
                                                    </Text>
                                                    <Text size="xs" c="dimmed">
                                                        {chart.description}
                                                    </Text>
                                                </Stack>
                                                <MantineIcon
                                                    icon={IconChevronRight}
                                                    color="gray"
                                                />
                                            </Group>
                                        </UnstyledButton>
                                    ))}
                                </Stack>
                            ),
                        )}
                        <Button
                            variant="default"
                            leftSection={<MantineIcon icon={IconPlus} />}
                            onClick={onCreateChartType}
                        >
                            Create new chart type
                        </Button>
                    </>
                ) : (
                    <>
                        <Button
                            variant="subtle"
                            size="xs"
                            px={0}
                            leftSection={<MantineIcon icon={IconArrowLeft} />}
                            onClick={() => setStep('choose')}
                        >
                            Back to chart types
                        </Button>
                        <Paper withBorder radius="md" p="sm">
                            <Group wrap="nowrap">
                                <Box className={classes.catalogThumbnail}>
                                    <ChartPreview
                                        kind={selectedChart.kind}
                                        palette={palette}
                                        compact
                                    />
                                </Box>
                                <Stack gap={3}>
                                    <Text fw={600}>{selectedChart.label}</Text>
                                    <Badge
                                        size="xs"
                                        variant="light"
                                        color={
                                            selectedChart.group === 'Project'
                                                ? 'violet'
                                                : 'gray'
                                        }
                                    >
                                        {selectedChart.group}
                                    </Badge>
                                </Stack>
                            </Group>
                        </Paper>
                        <ConfigControls
                            selectedChart={selectedChart}
                            palette={palette}
                            setPalette={setPalette}
                            showLabels={showLabels}
                            setShowLabels={setShowLabels}
                            onEditProjectChart={onEditProjectChart}
                        />
                        <Divider />
                        <PrototypeState
                            selectedChart={selectedChart}
                            palette={palette}
                            showLabels={showLabels}
                        />
                    </>
                )}
            </Stack>
        </ScrollArea>
    );
};

const RightSidebar = (props: RightSidebarProps) => (
    <Box className={`${classes.sidebar} ${classes.rightSidebar}`}>
        <Group className={classes.sidebarHeader} justify="space-between">
            <Group gap="xs">
                <MantineIcon icon={IconSettings} />
                <Text fw={600}>Configure chart</Text>
            </Group>
            <ActionIcon
                variant="subtle"
                color="gray"
                aria-label="Close chart design"
            >
                <MantineIcon icon={IconX} />
            </ActionIcon>
        </Group>
        <ChartGallerySidebar {...props} />
    </Box>
);

type EmbeddedBuilderProps = {
    buildStage: BuildStage;
    prompt: string;
    queryDirty: boolean;
    dataRevision: number;
    extraFieldSelected: boolean;
    executedExtraFieldSelected: boolean;
    editingChart: boolean;
    onPromptChange: (value: string) => void;
    onAdvance: () => void;
    onCancel: () => void;
    onApply: () => void;
    onRunQuery: () => void;
};

const BUILDER_EXAMPLES: Pick<ChartTypeOption, 'kind' | 'label'>[] = [
    { kind: 'area', label: 'A stream graph of share over time' },
    { kind: 'funnel', label: 'A funnel of signup steps' },
    { kind: 'treemap', label: 'A calendar heatmap of daily orders' },
    { kind: 'bar', label: 'A waterfall of revenue changes' },
];

const BuilderStartCanvas = ({
    buildStage,
    onPickExample,
}: {
    buildStage: BuildStage;
    onPickExample: (prompt: string) => void;
}) => (
    <Stack
        className={classes.builderStart}
        gap="xl"
        align="center"
        data-quiet={buildStage === 'clarify' || undefined}
    >
        {buildStage === 'building' ? (
            <>
                <Group className={classes.builderSkeleton} gap="xs" align="end">
                    {[34, 54, 43, 68, 47, 61].map((height, index) => (
                        <Box
                            key={height}
                            className={classes.builderSkeletonBar}
                            h={height}
                            style={{ animationDelay: `${index * 0.12}s` }}
                        />
                    ))}
                </Group>
                <Stack gap={4} align="center">
                    <Text size="md" fw={600}>
                        Building your chart type…
                    </Text>
                    <Text fz="xs" c="dimmed">
                        Using the latest executed Explorer results
                    </Text>
                </Stack>
            </>
        ) : (
            <>
                <Stack gap="xs" align="center">
                    <Text size="md" fw={600}>
                        Start with a prompt
                    </Text>
                    <Text fz="xs" c="dimmed" ta="center">
                        Describe the chart type you need. Iterate from there.
                    </Text>
                </Stack>
                <Group gap="sm" align="stretch" justify="center">
                    {BUILDER_EXAMPLES.map((example) => (
                        <UnstyledButton
                            key={example.label}
                            className={classes.builderExample}
                            onClick={() => onPickExample(example.label)}
                        >
                            <Box className={classes.builderExamplePreview}>
                                <ChartPreview
                                    kind={example.kind}
                                    palette="blue"
                                    compact
                                    showLabels={false}
                                />
                            </Box>
                            <Text fz={13} fw={500} lh={1.35}>
                                {example.label}
                            </Text>
                        </UnstyledButton>
                    ))}
                </Group>
            </>
        )}
    </Stack>
);

const BuilderResultCanvas = ({
    queryDirty,
    dataRevision,
    onRunQuery,
}: Pick<
    EmbeddedBuilderProps,
    'queryDirty' | 'dataRevision' | 'onRunQuery'
>) => (
    <Stack className={classes.builderResult} gap="sm">
        {queryDirty && (
            <Paper
                withBorder
                radius="md"
                p="sm"
                className={classes.staleResultsNotice}
            >
                <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={IconAlertCircle} color="yellow" />
                        <Text size="xs">
                            The Explorer query changed. This preview still uses
                            Run {dataRevision}.
                        </Text>
                    </Group>
                    <Button size="compact-xs" onClick={onRunQuery}>
                        Run updated query
                    </Button>
                </Group>
            </Paper>
        )}
        <Box className={classes.builderResultCard}>
            <Stack className={classes.builderOptionsPanel} gap="sm">
                <Text className={classes.generatedChip}>Generated options</Text>
                <Group gap="xs" className={classes.builderOptionTabs}>
                    <Text size="xs" fw={600} c="blue">
                        Style
                    </Text>
                    <Text size="xs" c="dimmed">
                        Labels
                    </Text>
                </Group>
                <Select
                    size="xs"
                    label="Layout"
                    value="Waterfall"
                    data={['Waterfall', 'Stacked', 'Grouped']}
                    readOnly
                />
                <Select
                    size="xs"
                    label="Direction"
                    value="Vertical"
                    data={['Vertical', 'Horizontal']}
                    readOnly
                />
                <Switch size="xs" label="Show final total" defaultChecked />
                <Switch size="xs" label="Show value labels" defaultChecked />
                <Stack gap={5}>
                    <Text size="xs" fw={500}>
                        Color palette
                    </Text>
                    <Group gap={5}>
                        {['#228be6', '#12b886', '#fa5252', '#fab005'].map(
                            (color) => (
                                <Box
                                    key={color}
                                    className={classes.paletteSwatch}
                                    bg={color}
                                />
                            ),
                        )}
                    </Group>
                </Stack>
            </Stack>
            <Box className={classes.builderResultPreview}>
                <Stack gap={2} className={classes.builderResultTitle}>
                    <Text fw={600}>Event change waterfall</Text>
                    <Text size="xs" c="dimmed">
                        Run {dataRevision} · 10 rows
                    </Text>
                </Stack>
                <Box className={classes.builderResultChart}>
                    <ChartPreview kind="bar" palette="blue" showLabels />
                </Box>
            </Box>
        </Box>
    </Stack>
);

const BuilderPromptBar = ({
    buildStage,
    prompt,
    onPromptChange,
    onAdvance,
}: Pick<
    EmbeddedBuilderProps,
    'buildStage' | 'prompt' | 'onPromptChange' | 'onAdvance'
>) => {
    const isLocked = buildStage === 'clarify' || buildStage === 'building';
    const placeholder =
        buildStage === 'clarify'
            ? 'Answer the questions, or skip, to build…'
            : buildStage === 'building'
              ? 'Building your chart type…'
              : buildStage === 'ready'
                ? 'Ask for a change…'
                : 'Describe a new chart type…';

    return (
        <Box className={classes.builderPromptWrap}>
            {buildStage === 'clarify' && (
                <Paper
                    withBorder
                    radius="lg"
                    className={classes.clarificationSheet}
                >
                    <Group gap="xs" wrap="nowrap">
                        <MantineIcon icon={IconSparkles} size={14} />
                        <Text size="xs" fw={500} truncate flex={1}>
                            {prompt}
                        </Text>
                        <ActionIcon variant="subtle" size="xs">
                            <MantineIcon icon={IconPencil} size={13} />
                        </ActionIcon>
                    </Group>
                    <TextInput
                        size="xs"
                        label="How should increases and decreases be colored?"
                        placeholder="Use green for increases and red for decreases"
                    />
                    <TextInput
                        size="xs"
                        label="Should the final total be shown?"
                        placeholder="Yes, include a total bar at the end"
                    />
                    <Group justify="space-between">
                        <Button variant="subtle" color="gray" size="xs">
                            Skip and build anyway
                        </Button>
                        <Button size="xs" onClick={onAdvance}>
                            Build
                        </Button>
                    </Group>
                </Paper>
            )}
            {buildStage === 'building' && (
                <Paper
                    withBorder
                    radius="lg"
                    className={classes.builderStatusRow}
                >
                    <Group justify="space-between" wrap="nowrap">
                        <Group gap="xs" wrap="nowrap">
                            <Box className={classes.builderStatusDot} />
                            <Text size="xs" fw={600}>
                                Building… 0:12
                            </Text>
                            <Text size="xs" c="dimmed" truncate>
                                “{prompt}”
                            </Text>
                        </Group>
                        <Button
                            variant="subtle"
                            color="gray"
                            size="compact-xs"
                            onClick={onAdvance}
                        >
                            Finish simulated build
                        </Button>
                    </Group>
                </Paper>
            )}
            <Paper withBorder radius="lg" className={classes.builderPromptPill}>
                <Textarea
                    variant="unstyled"
                    autosize
                    minRows={1}
                    maxRows={4}
                    value={isLocked ? '' : prompt}
                    placeholder={placeholder}
                    disabled={isLocked}
                    onChange={(event) =>
                        onPromptChange(event.currentTarget.value)
                    }
                />
                <Group justify="space-between" wrap="nowrap">
                    <Button variant="subtle" color="gray" size="compact-xs">
                        Auto
                    </Button>
                    <Group gap={4} wrap="nowrap">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label="Attach"
                        >
                            <MantineIcon icon={IconPaperclip} />
                        </ActionIcon>
                        <ActionIcon
                            color="blue"
                            radius="xl"
                            size="sm"
                            aria-label="Send"
                            disabled={isLocked || prompt.trim().length === 0}
                            onClick={onAdvance}
                        >
                            <MantineIcon icon={IconArrowUp} />
                        </ActionIcon>
                    </Group>
                </Group>
            </Paper>
        </Box>
    );
};

const BuilderHeader = ({
    buildStage,
    editingChart,
    onCancel,
    onApply,
}: Pick<
    EmbeddedBuilderProps,
    'buildStage' | 'editingChart' | 'onCancel' | 'onApply'
>) => (
    <Group className={classes.builderHeader} justify="space-between">
        <Group gap="sm">
            <Button
                variant="default"
                size="xs"
                leftSection={<MantineIcon icon={IconArrowLeft} size={14} />}
                onClick={onCancel}
            >
                Explorer
            </Button>
            <Divider orientation="vertical" />
            <Text size="sm" fw={650}>
                {editingChart
                    ? 'Event tier pulse'
                    : buildStage === 'ready'
                      ? 'Event change waterfall'
                      : 'Untitled chart type'}
            </Text>
            {buildStage === 'ready' && (
                <Text size="xs" c="dimmed">
                    Created by you · just now
                </Text>
            )}
        </Group>
        <Group gap="xs">
            {(editingChart || buildStage === 'ready') && (
                <Button
                    size="xs"
                    variant="default"
                    leftSection={<MantineIcon icon={IconHistory} size={14} />}
                >
                    History
                </Button>
            )}
            {buildStage === 'ready' && (
                <Button
                    size="xs"
                    leftSection={
                        <MantineIcon icon={IconCircleCheck} size={14} />
                    }
                    onClick={onApply}
                >
                    Preview in Explorer
                </Button>
            )}
        </Group>
    </Group>
);

const EmbeddedBuilderWorkspace = (props: EmbeddedBuilderProps) => {
    return (
        <Box className={classes.embeddedBuilder}>
            <BuilderHeader {...props} />
            <Box className={classes.builderBody}>
                {props.buildStage === 'ready' ? (
                    <BuilderResultCanvas {...props} />
                ) : (
                    <BuilderStartCanvas
                        buildStage={props.buildStage}
                        onPickExample={props.onPromptChange}
                    />
                )}
                <BuilderPromptBar {...props} />
            </Box>
            <Code block className={classes.authoringState}>
                {JSON.stringify(
                    {
                        mode: 'authoring',
                        buildStage: props.buildStage,
                        query: {
                            executedRevision: props.dataRevision,
                            draftChanged: props.queryDirty,
                            selectedFields: props.extraFieldSelected ? 4 : 3,
                            executedFields: props.executedExtraFieldSelected
                                ? 4
                                : 3,
                        },
                        previousChart: 'event-tier-pulse',
                        draftChart: 'generated-waterfall',
                    },
                    null,
                    2,
                )}
            </Code>
        </Box>
    );
};

const ResultsTable = () => (
    <ScrollArea>
        <Table
            className={classes.resultTable}
            striped
            withTableBorder
            withColumnBorders
            highlightOnHover
        >
            <Table.Thead>
                <Table.Tr>
                    <Table.Th w={48}>#</Table.Th>
                    <Table.Th>Event tier ···</Table.Th>
                    <Table.Th>Event ···</Table.Th>
                    <Table.Th ta="right">Count ···</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {QUERY_ROWS.map((row, index) => (
                    <Table.Tr key={`${row.tier}-${row.event}`}>
                        <Table.Td>{index + 1}</Table.Td>
                        <Table.Td>{row.tier}</Table.Td>
                        <Table.Td>{row.event}</Table.Td>
                        <Table.Td ta="right">
                            {row.count.toLocaleString()}
                        </Table.Td>
                    </Table.Tr>
                ))}
                <Table.Tr>
                    <Table.Td colSpan={3} fw={600}>
                        Total
                    </Table.Td>
                    <Table.Td ta="right" fw={700}>
                        {TOTAL.toLocaleString()}
                    </Table.Td>
                </Table.Tr>
            </Table.Tbody>
        </Table>
    </ScrollArea>
);

const ExplorerMain = ({
    selectedChart,
    palette,
    showLabels,
    queryDirty,
    dataRevision,
    onRunQuery,
}: {
    selectedChart: ChartTypeOption;
    palette: Palette;
    showLabels: boolean;
    queryDirty: boolean;
    dataRevision: number;
    onRunQuery: () => void;
}) => (
    <Box className={classes.main}>
        <Stack gap="md">
            <Group className={classes.toolbar} justify="space-between">
                <Button
                    variant="default"
                    size="xs"
                    leftSection={<MantineIcon icon={IconRefresh} />}
                >
                    Refresh dbt
                </Button>
                <Group gap="xs">
                    <Button
                        color="dark"
                        size="xs"
                        leftSection={<MantineIcon icon={IconPlayerPlay} />}
                        rightSection={<MantineIcon icon={IconChevronDown} />}
                        onClick={onRunQuery}
                    >
                        {queryDirty
                            ? 'Run updated query'
                            : `Run query · ${dataRevision}`}
                    </Button>
                    <Button
                        variant="default"
                        size="xs"
                        leftSection={<MantineIcon icon={IconDeviceFloppy} />}
                    >
                        Save chart
                    </Button>
                </Group>
            </Group>

            <Paper className={classes.sectionCard} radius="md">
                <Group className={classes.sectionHeader} gap="xs">
                    <MantineIcon icon={IconChevronRight} />
                    <Text size="sm" fw={600}>
                        Filters
                    </Text>
                </Group>
            </Paper>

            <Paper className={classes.sectionCard} radius="md">
                <Group
                    className={classes.sectionHeader}
                    justify="space-between"
                >
                    <Group gap="xs">
                        <MantineIcon icon={IconChevronDown} />
                        <Text size="sm" fw={600}>
                            Chart
                        </Text>
                        {queryDirty && (
                            <Badge size="xs" variant="outline" color="yellow">
                                Results are stale
                            </Badge>
                        )}
                        {selectedChart.source !== 'standard' && (
                            <Badge
                                size="xs"
                                variant="light"
                                color={
                                    selectedChart.source === 'project'
                                        ? 'violet'
                                        : 'gray'
                                }
                            >
                                {selectedChart.label}
                            </Badge>
                        )}
                    </Group>
                    <Group gap="xs">
                        <Text size="xs" c="dimmed">
                            UTC
                        </Text>
                        <Button
                            variant="default"
                            size="compact-xs"
                            rightSection={
                                <MantineIcon icon={IconSettings} size={13} />
                            }
                        >
                            Configure
                        </Button>
                    </Group>
                </Group>
                <Box className={classes.chartStage}>
                    <ChartPreview
                        kind={selectedChart.kind}
                        palette={palette}
                        showLabels={showLabels}
                    />
                </Box>
            </Paper>

            <Paper className={classes.sectionCard} radius="md">
                <Group
                    className={classes.sectionHeader}
                    justify="space-between"
                >
                    <Group gap="xs">
                        <MantineIcon icon={IconChevronDown} />
                        <Text size="sm" fw={600}>
                            Results
                        </Text>
                    </Group>
                    <Button
                        variant="default"
                        size="compact-xs"
                        leftSection={<MantineIcon icon={IconPlus} />}
                    >
                        Table calculation
                    </Button>
                </Group>
                <Box p="xs">
                    <ResultsTable />
                </Box>
            </Paper>
        </Stack>
    </Box>
);

const ExplorerChartGalleryPrototype = ({
    featureFlagEnabled,
}: {
    featureFlagEnabled: boolean;
}) => {
    const [flagEnabled, setFlagEnabled] = useState(featureFlagEnabled);
    const [selectedId, setSelectedId] = useState('event-tier-pulse');
    const [palette, setPalette] = useState<Palette>('navy');
    const [showLabels, setShowLabels] = useState(true);
    const [mode, setMode] = useState<ExplorerMode>('explore');
    const [buildStage, setBuildStage] = useState<BuildStage>('brief');
    const [prompt, setPrompt] = useState(
        'Build a waterfall chart that shows how event volume changes by tier, broken down by event.',
    );
    const [queryDirty, setQueryDirty] = useState(false);
    const [dataRevision, setDataRevision] = useState(1);
    const [extraFieldSelected, setExtraFieldSelected] = useState(false);
    const [executedExtraFieldSelected, setExecutedExtraFieldSelected] =
        useState(false);
    const [previousSelectedId, setPreviousSelectedId] =
        useState('event-tier-pulse');
    const [editingChart, setEditingChart] = useState(false);

    useEffect(() => setFlagEnabled(featureFlagEnabled), [featureFlagEnabled]);

    const selectedChart = useMemo(
        () => CHART_TYPES.find(({ id }) => id === selectedId) ?? CHART_TYPES[0],
        [selectedId],
    );

    const beginAuthoring = (editing: boolean) => {
        setPreviousSelectedId(selectedId);
        setEditingChart(editing);
        setBuildStage(editing ? 'ready' : 'brief');
        setMode('authoring');
    };

    const cancelAuthoring = () => {
        setSelectedId(previousSelectedId);
        setMode('explore');
    };

    const applyDraftChart = () => {
        setSelectedId('generated-waterfall');
        setMode('explore');
    };

    const advanceBuild = () => {
        const nextStage: Record<BuildStage, BuildStage> = {
            brief: 'clarify',
            clarify: 'building',
            building: 'ready',
            ready: 'building',
        };
        if (buildStage === 'building') setPrompt('');
        setBuildStage(nextStage[buildStage]);
    };

    const toggleExtraField = () => {
        setExtraFieldSelected((selected) => {
            const nextSelected = !selected;
            setQueryDirty(nextSelected !== executedExtraFieldSelected);
            return nextSelected;
        });
    };

    const runQuery = () => {
        setDataRevision((revision) => revision + 1);
        setExecutedExtraFieldSelected(extraFieldSelected);
        setQueryDirty(false);
    };

    return (
        <Box className={classes.prototype}>
            <Group className={classes.featureBar} justify="space-between">
                <Group gap="sm">
                    <Badge variant="filled" color="dark">
                        PROTOTYPE
                    </Badge>
                    <Stack gap={0}>
                        <Text size="sm" fw={600}>
                            {mode === 'authoring'
                                ? 'Explorer · embedded chart authoring'
                                : 'Explorer chart selection'}
                        </Text>
                        <Text fz={10} c="dimmed">
                            {mode === 'authoring'
                                ? 'Fields remain available · preview uses the latest executed results'
                                : 'Project chart types use the current query results'}
                        </Text>
                    </Stack>
                </Group>
                <Group gap="xs">
                    <Text size="xs" c="dimmed">
                        new-explorer-chart-sidebar
                    </Text>
                    <Switch
                        checked={flagEnabled}
                        onChange={(event) =>
                            setFlagEnabled(event.currentTarget.checked)
                        }
                        onLabel="ON"
                        offLabel="OFF"
                        size="md"
                    />
                </Group>
            </Group>

            <Box
                className={`${classes.workspace} ${
                    flagEnabled && mode === 'explore'
                        ? classes.workspaceWithRightSidebar
                        : ''
                }`}
            >
                {flagEnabled ? (
                    <FieldsSidebar
                        extraFieldSelected={extraFieldSelected}
                        queryDirty={queryDirty}
                        dataRevision={dataRevision}
                        authoring={mode === 'authoring'}
                        onToggleExtraField={toggleExtraField}
                        onRunQuery={runQuery}
                    />
                ) : (
                    <LegacyConfigSidebar
                        selectedId={selectedId}
                        setSelectedId={setSelectedId}
                        palette={palette}
                        setPalette={setPalette}
                        showLabels={showLabels}
                        setShowLabels={setShowLabels}
                    />
                )}
                {mode === 'authoring' ? (
                    <EmbeddedBuilderWorkspace
                        buildStage={buildStage}
                        prompt={prompt}
                        queryDirty={queryDirty}
                        dataRevision={dataRevision}
                        extraFieldSelected={extraFieldSelected}
                        executedExtraFieldSelected={executedExtraFieldSelected}
                        editingChart={editingChart}
                        onPromptChange={setPrompt}
                        onAdvance={advanceBuild}
                        onCancel={cancelAuthoring}
                        onApply={applyDraftChart}
                        onRunQuery={runQuery}
                    />
                ) : (
                    <>
                        <ExplorerMain
                            selectedChart={selectedChart}
                            palette={palette}
                            showLabels={showLabels}
                            queryDirty={queryDirty}
                            dataRevision={dataRevision}
                            onRunQuery={runQuery}
                        />
                        {flagEnabled && (
                            <RightSidebar
                                selectedChart={selectedChart}
                                setSelectedId={setSelectedId}
                                palette={palette}
                                setPalette={setPalette}
                                showLabels={showLabels}
                                setShowLabels={setShowLabels}
                                onCreateChartType={() => beginAuthoring(false)}
                                onEditProjectChart={() => beginAuthoring(true)}
                            />
                        )}
                    </>
                )}
            </Box>
        </Box>
    );
};

const meta: Meta<typeof ExplorerChartGalleryPrototype> = {
    title: 'Prototypes/Explorer/Chart gallery sidebar',
    component: ExplorerChartGalleryPrototype,
    parameters: {
        layout: 'fullscreen',
        docs: {
            description: {
                component:
                    'Throwaway interaction prototype for selecting, creating, and editing chart types without leaving Explorer. Fields stay available on the left while the embedded authoring flow exercises clarification, query refresh, build, apply, and cancel.',
            },
        },
    },
    args: {
        featureFlagEnabled: true,
    },
    argTypes: {
        featureFlagEnabled: {
            control: 'boolean',
            description: 'Prototype stand-in for the production feature flag.',
        },
    },
};

export default meta;
type Story = StoryObj<typeof ExplorerChartGalleryPrototype>;

export const InteractionWorkbench: Story = {};
