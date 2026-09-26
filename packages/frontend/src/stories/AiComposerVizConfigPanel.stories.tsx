import {
    ChartKind,
    DimensionType,
    getComposerVizPanelOptions,
    QuerySourceType,
    switchComposerVizKind,
    VizAggregationOptions,
    VizIndexType,
    type AllVizChartConfig,
    type ComposerVizKind,
    type RawResultRow,
    type ResultColumn,
    type SourceQuery,
} from '@lightdash/common';
import { Box, Center, Stack, Text } from '@mantine/core';
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { clsx } from 'clsx';
import { useState } from 'react';
import panelStyles from '../ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.module.css';
import { AiComposerResultsExpired } from '../ee/features/aiCopilot/components/ChatElements/AiComposerResultsExpired';
import { AiComposerPipelinePanel } from '../ee/features/aiCopilot/components/ChatElements/composerPipeline/AiComposerPipelinePanel';
import {
    AiComposerVizConfigPanel,
    type AiComposerVizConfigPanelMode,
} from '../ee/features/aiCopilot/components/ChatElements/composerVizConfig/AiComposerVizConfigPanel';

const queries: SourceQuery[] = [
    {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'revenue',
        title: 'Revenue by month and region',
        exploreName: 'orders',
        dimensions: ['orders_month', 'orders_region'],
        metrics: ['orders_revenue', 'orders_count'],
    },
    {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'result',
        title: 'Revenue per region',
        sql: 'SELECT * FROM revenue',
        references: ['revenue'],
    },
];

const columns: ResultColumn[] = [
    { reference: 'month', type: DimensionType.DATE, label: 'Month' },
    { reference: 'region', type: DimensionType.STRING, label: 'Region' },
    { reference: 'revenue', type: DimensionType.NUMBER, label: 'Revenue' },
    { reference: 'orders', type: DimensionType.NUMBER, label: 'Orders' },
];

const rows: RawResultRow[] = ['2026-01-01', '2026-02-01'].flatMap((month) =>
    ['EMEA', 'APAC'].map((region) => ({
        month,
        region,
        revenue: 1000,
        orders: 10,
    })),
);

const lineWithSplit: AllVizChartConfig = {
    type: ChartKind.LINE,
    metadata: { version: 1 },
    fieldConfig: {
        x: { reference: 'month', type: VizIndexType.TIME },
        y: [{ reference: 'revenue', aggregation: VizAggregationOptions.SUM }],
        groupBy: [{ reference: 'region' }],
    },
    display: undefined,
};

const kindOf = (kind: ComposerVizKind) =>
    switchComposerVizKind(lineWithSplit, kind, {
        columns,
        rows,
        node: null,
        remembered: null,
    });

const barWithTwoValues: AllVizChartConfig = {
    type: ChartKind.VERTICAL_BAR,
    metadata: { version: 1 },
    fieldConfig: {
        x: { reference: 'region', type: VizIndexType.CATEGORY },
        y: [
            { reference: 'revenue', aggregation: VizAggregationOptions.SUM },
            { reference: 'orders', aggregation: VizAggregationOptions.SUM },
        ],
        groupBy: [],
    },
    display: undefined,
};

type Args = {
    initialValue: AllVizChartConfig;
    mode: AiComposerVizConfigPanelMode;
    defaultExpanded: boolean;
    fieldsDisabledReason: string | null;
    isExpired: boolean;
};

/** The composer artifact chrome with the viz config panel over a placeholder result; state in memory. */
const PanelStory = ({
    initialValue,
    mode,
    defaultExpanded,
    fieldsDisabledReason,
    isExpired,
}: Args) => {
    const [value, setValue] = useState(initialValue);
    const [remembered, setRemembered] = useState<AllVizChartConfig | null>(
        null,
    );
    const [isChartOpen, setIsChartOpen] = useState(defaultExpanded);
    const [isPipelineOpen, setIsPipelineOpen] = useState(false);
    const head = (
        <Box className={clsx(panelStyles.head, panelStyles.flushHead)}>
            <Text fz="sm" fw={600}>
                Revenue per region
            </Text>
        </Box>
    );
    return (
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
                        terminalNodeId="result"
                        displayedNodeId="result"
                        displayableNodeIds={new Set(['revenue', 'result'])}
                        onDisplayNode={() => {}}
                        expanded={isPipelineOpen}
                        onExpandedChange={(open) => {
                            setIsPipelineOpen(open);
                            if (open) setIsChartOpen(false);
                        }}
                    >
                        <AiComposerVizConfigPanel
                            value={value}
                            columns={columns}
                            options={getComposerVizPanelOptions(
                                value,
                                columns,
                                rows,
                            )}
                            onChange={setValue}
                            onKindChange={(kind) => {
                                if (value.type !== ChartKind.TABLE)
                                    setRemembered(value);
                                setValue(
                                    switchComposerVizKind(value, kind, {
                                        columns,
                                        rows,
                                        node: null,
                                        remembered,
                                    }),
                                );
                            }}
                            mode={mode}
                            expanded={isChartOpen}
                            onExpandedChange={(open) => {
                                setIsChartOpen(open);
                                if (open) setIsPipelineOpen(false);
                            }}
                            fieldsDisabledReason={fieldsDisabledReason}
                        >
                            {isExpired ? (
                                <AiComposerResultsExpired headerContent={head} />
                            ) : (
                                <Stack gap="md" h="100%">
                                    {head}
                                    <Center flex={1} bg="ldGray.0" mx="md">
                                        <Text size="xs" c="dimmed">
                                            The chart renders here
                                        </Text>
                                    </Center>
                                </Stack>
                            )}
                        </AiComposerVizConfigPanel>
                    </AiComposerPipelinePanel>
                </Box>
            </Box>
        </Box>
    );
};

const meta = {
    component: PanelStory,
    title: 'AI Agent/Composer viz config panel',
    args: {
        initialValue: lineWithSplit,
        mode: 'expandable',
        defaultExpanded: true,
        fieldsDisabledReason: null,
        isExpired: false,
    },
} satisfies Meta<typeof PanelStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = { args: { defaultExpanded: false } };

export const LineWithSplit: Story = {};

export const BarWithTwoValues: Story = {
    args: { initialValue: barWithTwoValues },
};

export const Pie: Story = { args: { initialValue: kindOf('pie') } };

export const BigNumber: Story = {
    args: { initialValue: kindOf('big_number') },
};

export const Table: Story = { args: { initialValue: kindOf('table') } };

export const ReadOnly: Story = {
    args: {
        fieldsDisabledReason:
            'Only the thread owner or an agent admin can change this chart',
    },
};

export const OtherNode: Story = { args: { mode: 'switcher' } };

export const Expired: Story = {
    args: { mode: 'static', isExpired: true },
};
