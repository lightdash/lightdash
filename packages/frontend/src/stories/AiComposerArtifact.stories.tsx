import {
    QuerySourceType,
    type FunnelSourceQuery,
    type SourceQuery,
} from '@lightdash/common';
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
import { useState } from 'react';
import MantineIcon from '../components/common/MantineIcon';
import panelStyles from '../ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.module.css';
import { AiComposerResultError } from '../ee/features/aiCopilot/components/ChatElements/AiComposerResultError';
import { AiComposerLineage } from '../ee/features/aiCopilot/components/ChatElements/composerPipeline/AiComposerLineage';
import { ComposerQueriesToolCallDescription } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/descriptions/ComposerQueriesToolCallDescription';
import { type ComposerRunNodeStatus } from '../ee/features/aiCopilot/components/ChatElements/useComposerRunNodeStatuses';
import {
    ordersSemanticNode,
    STORY_PROJECT_UUID,
} from './fixtures/semanticQueryStoryData';
import SemanticQueryStoryProviders from './fixtures/SemanticQueryStoryProviders';

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

/** Every node type in one pipeline; the warehouse SQL node predates descriptions. */
const allNodeTypesQueries: SourceQuery[] = [
    fanInQueries[0],
    {
        sourceType: QuerySourceType.SQL,
        nodeId: 'orders',
        title: 'Order amounts',
        sql: 'SELECT order_id, amount FROM jaffle.orders',
    },
    simulationNode,
    fanInQueries[2],
    {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'summary',
        title: 'Simulation vs target',
        description: 'Simulated revenue next to order counts and targets.',
        sql: 'SELECT * FROM order_counts JOIN targets USING (status) CROSS JOIN (SELECT median(total_amount) AS p50 FROM simulation)',
        references: ['order_counts', 'simulation', 'targets'],
    },
];

const checkoutFunnel: FunnelSourceQuery = {
    sourceType: QuerySourceType.FUNNEL,
    nodeId: 'checkout_funnel',
    title: 'Checkout funnel',
    description:
        'Users who went from a page view to a completed checkout, by device.',
    exploreName: 'product_events',
    userIdFieldId: 'product_events_user_id',
    timestampFieldId: 'product_events_event_timestamp',
    eventNameFieldId: 'product_events_event_name',
    steps: [
        { stepOrder: 1, eventName: 'page_view' },
        { stepOrder: 2, eventName: 'product_viewed' },
        { stepOrder: 3, eventName: 'add_to_cart' },
        { stepOrder: 4, eventName: 'checkout_completed' },
    ],
    dateRange: { type: 'preset', preset: 'last_30_days' },
    conversionWindow: { value: 7, unit: 'days' },
    breakdownDimensionId: 'product_events_device_type',
};

/** A funnel and a semantic node, joined by a duckdb node. */
const funnelQueries: SourceQuery[] = [
    checkoutFunnel,
    ordersSemanticNode,
    {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'drop_off_by_device',
        title: 'Drop-off by device',
        description: 'Where each device loses users, next to weekly revenue.',
        sql: 'SELECT f.breakdown_value AS device_type, f.step_name, f.total_users, 100 - f.step_conversion_rate AS drop_off_pct, r.revenue FROM checkout_funnel AS f CROSS JOIN (SELECT SUM(orders_total_order_amount) AS revenue FROM weekly_orders) AS r WHERE f.step_order > 1 ORDER BY drop_off_pct DESC',
        references: ['checkout_funnel', 'weekly_orders'],
    },
];

const minimalFunnel: FunnelSourceQuery = {
    sourceType: QuerySourceType.FUNNEL,
    nodeId: 'signup_funnel',
    title: 'Sign-up activation',
    description: 'Users who signed up and went on to create a project.',
    exploreName: 'product_events',
    userIdFieldId: 'product_events_user_id',
    timestampFieldId: 'product_events_event_timestamp',
    eventNameFieldId: 'product_events_event_name',
    steps: [
        { stepOrder: 1, eventName: 'signed_up' },
        { stepOrder: 2, eventName: 'project_created' },
    ],
    dateRange: {
        type: 'custom',
        start: '2026-01-01T00:00:00Z',
        end: '2026-03-31T00:00:00Z',
    },
};

const success = (totalRowCount: number, durationMs: number) => ({
    status: 'success' as const,
    error: null,
    totalRowCount,
    durationMs,
});

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

const ResultsTable = ({
    result,
    withBorder = true,
}: {
    result: ResultTable;
    /** Off inside a notebook cell, whose frame already draws the edges. */
    withBorder?: boolean;
}) => (
    <Paper radius={0} bg="ldGray.0" withBorder={withBorder}>
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
                    <Table.Tr key={row.join('|')}>
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
    /** Shows the lineage instead of the result. */
    lineage?: boolean;
    nodeStatuses?: Record<string, ComposerRunNodeStatus>;
    /** The displayed node's error, shown in place of the result. */
    resultError?: string;
};

/** The floating artifact panel at its real size, with a static results table. */
const ComposerArtifact = ({
    queries,
    terminalNodeId,
    result,
    lineage,
    nodeStatuses = {},
    resultError,
}: ArtifactProps) => {
    const [chatNodeIds, setChatNodeIds] = useState<ReadonlySet<string>>(
        () => new Set(),
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
                    {lineage ? (
                        <AiComposerLineage
                            projectUuid={STORY_PROJECT_UUID}
                            queries={queries}
                            terminalNodeId={terminalNodeId}
                            displayableNodeIds={
                                new Set(queries.map((q) => q.nodeId!))
                            }
                            nodeStatuses={nodeStatuses}
                            renderNodeResult={() => (
                                <ResultsTable
                                    result={result}
                                    withBorder={false}
                                />
                            )}
                            chatNodeIds={chatNodeIds}
                            onAddToChat={(node) =>
                                setChatNodeIds(
                                    (current) =>
                                        new Set([...current, node.nodeId]),
                                )
                            }
                        />
                    ) : (
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
                                <Group
                                    gap={2}
                                    className={panelStyles.headRight}
                                >
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
                    )}
                </Box>
            </Box>
        </Box>
    );
};

const meta = {
    component: ComposerArtifact,
    title: 'AI Agent/Composer artifact',
    decorators: [
        (Story) => (
            <SemanticQueryStoryProviders>
                <Story />
            </SemanticQueryStoryProviders>
        ),
    ],
    args: {
        queries: fanInQueries,
        terminalNodeId: 'vs_target',
        result: fanInResult,
    },
} satisfies Meta<typeof ComposerArtifact>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Result: Story = {};

export const Lineage: Story = {
    args: { lineage: true },
};

export const PythonResult: Story = {
    args: {
        queries: pythonTerminalQueries,
        terminalNodeId: 'simulation',
        lineage: true,
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
        lineage: true,
        result: {
            title: 'Revenue percentiles',
            description: SIMULATION_DESCRIPTION,
            columns: ['p5', 'p50', 'p95'],
            rows: [[871.4, 1001.25, 1139.6]],
        },
    },
};

export const AllNodeTypes: Story = {
    args: {
        queries: allNodeTypesQueries,
        terminalNodeId: 'summary',
        lineage: true,
    },
};

/** A semantic-layer node with filters, sorts, a limit and parameters. */
export const SemanticNodeDetails: Story = {
    args: {
        queries: [
            ordersSemanticNode,
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'weekly_share',
                title: 'Weekly share of orders',
                description: 'Each week as a share of all orders.',
                sql: 'SELECT *, orders_unique_order_count * 100.0 / SUM(orders_unique_order_count) OVER () AS share FROM weekly_orders',
                references: ['weekly_orders'],
            },
        ],
        terminalNodeId: 'weekly_share',
        lineage: true,
        result: {
            title: 'Weekly share of orders',
            description: 'Completed orders per week, last 90 days.',
            columns: ['week', 'status', 'orders', 'share'],
            rows: [
                ['2026-10-19', 'completed', 31, '24.6'],
                ['2026-10-12', 'shipped', 28, '22.2'],
                ['2026-10-05', 'completed', 35, '27.8'],
            ],
        },
    },
    play: async ({ canvas, userEvent }) => {
        await userEvent.click(
            canvas.getByRole('button', { name: /View metric query/ }),
        );
    },
};

const FUNNEL_COLUMNS = [
    'step_order',
    'step_name',
    'total_users',
    'conversion_rate',
    'step_conversion_rate',
    'median_time_to_convert',
];

/** A funnel with a breakdown, a semantic node and a duckdb node reading both. */
export const FunnelPipelineLineage: Story = {
    args: {
        queries: funnelQueries,
        terminalNodeId: 'drop_off_by_device',
        lineage: true,
        nodeStatuses: {
            checkout_funnel: success(8, 1840),
            weekly_orders: success(52, 620),
            drop_off_by_device: success(6, 45),
        },
        result: {
            title: 'Checkout funnel',
            description: 'One row per step and device, last 30 days.',
            columns: [...FUNNEL_COLUMNS, 'breakdown_value'],
            rows: [
                [1, 'page_view', 12480, 100, 100, '—', 'desktop'],
                [2, 'product_viewed', 7612, 61, 61, 184, 'desktop'],
                [3, 'add_to_cart', 2740, 22, 36, 412, 'desktop'],
                [4, 'checkout_completed', 1726, 13.8, 63, 905, 'desktop'],
                [1, 'page_view', 18930, 100, 100, '—', 'mobile'],
                [2, 'product_viewed', 9844, 52, 52, 210, 'mobile'],
                [3, 'add_to_cart', 2658, 14, 27, 498, 'mobile'],
                [4, 'checkout_completed', 1302, 6.9, 49, 1260, 'mobile'],
            ],
        },
    },
};

/** Two steps, the default window, a custom range and no breakdown. */
export const FunnelMinimalLineage: Story = {
    args: {
        queries: [minimalFunnel],
        terminalNodeId: 'signup_funnel',
        lineage: true,
        nodeStatuses: { signup_funnel: success(2, 930) },
        result: {
            title: 'Sign-up activation',
            description: 'Sign-ups that created a project, Q1 2026.',
            columns: FUNNEL_COLUMNS,
            rows: [
                [1, 'signed_up', 4210, 100, 100, '—'],
                [2, 'project_created', 2694, 64, 64, 86400],
            ],
        },
    },
};

/** A run on open in progress: each node's status on its row. */
export const Running: Story = {
    args: {
        ...DuckdbOverPython.args,
        nodeStatuses: {
            orders: {
                status: 'success',
                error: null,
                totalRowCount: 5,
                durationMs: 120,
            },
            simulation: {
                status: 'running',
                error: null,
                totalRowCount: null,
                durationMs: null,
            },
            percentiles: {
                status: 'pending',
                error: null,
                totalRowCount: null,
                durationMs: null,
            },
        },
    },
};

/** A run whose python node failed: its error on its row, the terminal node's in the chart area. */
export const NodeFailed: Story = {
    args: {
        ...DuckdbOverPython.args,
        nodeStatuses: {
            orders: {
                status: 'success',
                error: null,
                totalRowCount: 5,
                durationMs: 120,
            },
            simulation: {
                status: 'error',
                error: 'ZeroDivisionError: division by zero',
                totalRowCount: null,
                durationMs: null,
            },
            percentiles: {
                status: 'error',
                error: 'A query this query reads failed',
                totalRowCount: null,
                durationMs: null,
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
