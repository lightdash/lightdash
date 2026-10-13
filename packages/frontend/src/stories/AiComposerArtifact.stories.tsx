import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    Paper,
    Stack,
    Table,
    Text,
} from '@mantine/core';
import { type Meta, type StoryObj } from '@storybook/react-vite';
import { IconX } from '@tabler/icons-react';
import { clsx } from 'clsx';
import MantineIcon from '../components/common/MantineIcon';
import panelStyles from '../ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.module.css';
import { AiComposerResultError } from '../ee/features/aiCopilot/components/ChatElements/AiComposerResultError';
import {
    AiComposerPipelinePanel,
    type ComposerRunNodeStatus,
    type PipelineMode,
} from '../ee/features/aiCopilot/components/ChatElements/composerPipeline/AiComposerPipelinePanel';
import { ComposerQueriesToolCallDescription } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/descriptions/ComposerQueriesToolCallDescription';

/** A fan-in pipeline: three sources, one intermediate join, one final join. */
const fanInQueries: SourceQuery[] = [
    {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'order_counts',
        title: 'Orders by status',
        description: 'Governed unique order count per status.',
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_unique_order_count'],
    },
    {
        sourceType: QuerySourceType.SQL,
        nodeId: 'avg_amounts',
        title: 'Average order amount',
        description: 'Raw warehouse average per status.',
        sql: 'SELECT status, ROUND(AVG(amount)::numeric, 2) AS avg_amount FROM jaffle.orders GROUP BY status',
    },
    {
        sourceType: QuerySourceType.EXTERNAL,
        nodeId: 'targets',
        title: 'Status targets',
        description: 'Uploaded CSV of target order counts.',
        sql: 'SELECT status, target_orders FROM targets_csv',
        tables: { targets_csv: 'targets.csv' },
    },
    {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'actuals',
        title: 'Actuals per status',
        description: 'Order counts joined with average amount.',
        sql: 'SELECT oc.orders_status AS status, oc.orders_unique_order_count AS order_count, aa.avg_amount FROM order_counts AS oc JOIN avg_amounts AS aa ON oc.orders_status = aa.status',
        references: ['order_counts', 'avg_amounts'],
    },
    {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'vs_target',
        title: 'Actuals vs target',
        description: 'Adds target and attainment per status.',
        sql: 'SELECT a.status, a.order_count, a.avg_amount, t.target_orders, ROUND(a.order_count * 100.0 / t.target_orders, 1) AS attainment_pct FROM actuals AS a LEFT JOIN targets AS t USING (status) ORDER BY a.order_count DESC',
        references: ['actuals', 'targets'],
    },
];

const SIMULATION_CODE = `import numpy as np
import pandas as pd

def run(inputs, params):
    orders = inputs["orders"]
    rng = np.random.default_rng(42)
    draws = rng.choice(orders["amount"].to_numpy(), size=(1000, 30))
    totals = draws.sum(axis=1)
    return pd.DataFrame({"simulation": np.arange(1000), "total_amount": totals})`;

const ordersSource: SourceQuery = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'orders',
    title: 'Order amounts',
    description: 'Every order amount from the warehouse.',
    sql: 'SELECT order_id, amount FROM jaffle.orders',
};

const simulationNode: SourceQuery = {
    sourceType: QuerySourceType.PYTHON,
    nodeId: 'simulation',
    title: 'Simulated monthly revenue',
    description: '1,000 Monte Carlo draws of 30 orders each.',
    code: SIMULATION_CODE,
    references: ['orders'],
};

const SIMULATION_DESCRIPTION =
    'Monte Carlo simulation of monthly revenue from warehouse order amounts.';

/** A python node as the terminal node. */
const pythonTerminalQueries: SourceQuery[] = [ordersSource, simulationNode];

/** A duckdb node reading a python node's result. */
const duckdbOverPythonQueries: SourceQuery[] = [
    ordersSource,
    simulationNode,
    {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'percentiles',
        title: 'Revenue percentiles',
        description: 'P5, median and P95 of the simulated totals.',
        sql: 'SELECT quantile_cont(total_amount, 0.05) AS p5, median(total_amount) AS p50, quantile_cont(total_amount, 0.95) AS p95 FROM simulation',
        references: ['simulation'],
    },
];

type ResultTable = {
    title: string;
    description: string;
    columns: string[];
    rows: (string | number)[][];
};

const fanInResult: ResultTable = {
    title: 'Orders by status vs target',
    description:
        'Semantic-layer order counts, warehouse average amount and uploaded targets.',
    columns: [
        'status',
        'order_count',
        'avg_amount',
        'target_orders',
        'attainment_pct',
    ],
    rows: [
        ['completed', 97, '25.50', 100, '97.0'],
        ['shipped', 26, '29.64', 30, '86.7'],
        ['placed', 22, '40.44', 20, '110.0'],
        ['returned', 4, '13.50', 5, '80.0'],
        ['return_pending', 2, '19.00', 2, '100.0'],
    ],
};

const ResultsTable = ({ result }: { result: ResultTable }) => (
    <Paper radius={0} bg="ldGray.0">
        <Table fz="xs" highlightOnHover>
            <Table.Thead>
                <Table.Tr>
                    {result.columns.map((column, index) => (
                        <Table.Th
                            key={column}
                            ta={index > 0 ? 'right' : undefined}
                        >
                            {column}
                        </Table.Th>
                    ))}
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {result.rows.map((row) => (
                    <Table.Tr key={String(row[0])}>
                        {row.map((cell, index) => (
                            <Table.Td
                                key={result.columns[index]}
                                ta={index > 0 ? 'right' : undefined}
                            >
                                {cell}
                            </Table.Td>
                        ))}
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    </Paper>
);

type ArtifactProps = {
    queries: SourceQuery[];
    terminalNodeId: string;
    result: ResultTable;
    defaultExpanded?: boolean;
    defaultMode?: PipelineMode;
    nodeStatuses?: Record<string, ComposerRunNodeStatus>;
    /** The displayed node's error, shown in place of the result. */
    resultError?: string;
};

/** The floating artifact panel at its real size, with a static results table. */
const ComposerArtifact = ({
    queries,
    terminalNodeId,
    result,
    defaultExpanded,
    defaultMode,
    nodeStatuses = {},
    resultError,
}: ArtifactProps) => (
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
                    terminalNodeId={terminalNodeId}
                    displayedNodeId={terminalNodeId}
                    displayableNodeIds={new Set(queries.map((q) => q.nodeId!))}
                    onDisplayNode={() => {}}
                    nodeStatuses={nodeStatuses}
                    defaultExpanded={defaultExpanded}
                    defaultMode={defaultMode}
                >
                    <Stack gap="md" h="100%" mih={0}>
                        <Box
                            className={clsx(
                                panelStyles.head,
                                panelStyles.flushHead,
                            )}
                        >
                            <Stack gap={0} flex={1} miw={0}>
                                <Text fz="sm" fw={600}>
                                    {result.title}
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    {result.description}
                                </Text>
                            </Stack>
                            <Group gap={2} className={panelStyles.headRight}>
                                <ActionIcon size="sm" aria-label="Close">
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            </Group>
                        </Box>
                        {resultError === undefined ? (
                            <ResultsTable result={result} />
                        ) : (
                            <AiComposerResultError
                                headerContent={null}
                                message={resultError}
                            />
                        )}
                    </Stack>
                </AiComposerPipelinePanel>
            </Box>
        </Box>
    </Box>
);

const meta = {
    component: ComposerArtifact,
    title: 'AI Agent/Composer artifact',
    args: {
        queries: fanInQueries,
        terminalNodeId: 'vs_target',
        result: fanInResult,
    },
} satisfies Meta<typeof ComposerArtifact>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};

export const Expanded: Story = {
    args: { defaultExpanded: true },
};

export const Graph: Story = {
    args: { defaultExpanded: true, defaultMode: 'graph' },
};

export const PythonResult: Story = {
    args: {
        queries: pythonTerminalQueries,
        terminalNodeId: 'simulation',
        defaultExpanded: true,
        result: {
            title: 'Simulated monthly revenue',
            description: SIMULATION_DESCRIPTION,
            columns: ['simulation', 'total_amount'],
            rows: [
                [0, 1012.5],
                [1, 948.0],
                [2, 1087.25],
                [3, 993.75],
            ],
        },
    },
};

export const DuckdbOverPython: Story = {
    args: {
        queries: duckdbOverPythonQueries,
        terminalNodeId: 'percentiles',
        defaultExpanded: true,
        result: {
            title: 'Revenue percentiles',
            description: SIMULATION_DESCRIPTION,
            columns: ['p5', 'p50', 'p95'],
            rows: [[871.4, 1001.25, 1139.6]],
        },
    },
};

export const DuckdbOverPythonGraph: Story = {
    args: { ...DuckdbOverPython.args, defaultMode: 'graph' },
};

/** A run on open in progress: each node's status on its row. */
export const Running: Story = {
    args: {
        ...DuckdbOverPython.args,
        nodeStatuses: {
            orders: { status: 'success', error: null },
            simulation: { status: 'running', error: null },
            percentiles: { status: 'pending', error: null },
        },
    },
};

/** A run whose python node failed: its error on its row, the terminal node's in the chart area. */
export const NodeFailed: Story = {
    args: {
        ...DuckdbOverPython.args,
        nodeStatuses: {
            orders: { status: 'success', error: null },
            simulation: {
                status: 'error',
                error: 'ZeroDivisionError: division by zero',
            },
            percentiles: {
                status: 'error',
                error: 'A query this query reads failed',
            },
        },
        resultError: 'A query this query reads failed',
    },
};

/** The pipeline card of a run whose python node failed; no artifact version exists. */
export const PythonNodeFailed: StoryObj<
    typeof ComposerQueriesToolCallDescription
> = {
    render: () => (
        <Box w={640}>
            <ComposerQueriesToolCallDescription
                queries={[
                    {
                        sourceType: QuerySourceType.SQL,
                        nodeId: 'orders',
                        title: 'Order amounts',
                        description: null,
                        sql: 'SELECT order_id, amount FROM jaffle.orders',
                        limit: 500,
                    },
                    {
                        sourceType: QuerySourceType.PYTHON,
                        nodeId: 'simulation',
                        title: 'Simulated monthly revenue',
                        description: null,
                        code: SIMULATION_CODE.replace(
                            'draws.sum(axis=1)',
                            'draws.sum(axis=1) / 0',
                        ),
                        references: ['orders'],
                        limit: 500,
                    },
                    {
                        sourceType: QuerySourceType.DUCKDB,
                        nodeId: 'percentiles',
                        title: 'Revenue percentiles',
                        description: null,
                        sql: 'SELECT median(total_amount) AS p50 FROM simulation',
                        references: ['simulation'],
                        limit: 500,
                    },
                ]}
                nodeStatuses={{
                    orders: { status: 'success' },
                    simulation: { status: 'error' },
                    percentiles: { status: 'error' },
                }}
            />
        </Box>
    ),
};
