import { QuerySourceType } from '@lightdash/common';
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
import MantineIcon from '../components/common/MantineIcon';
import panelStyles from '../ee/features/aiCopilot/components/ChatElements/AiArtifactPanel.module.css';
import { AiComposerPipelinePanel } from '../ee/features/aiCopilot/components/ChatElements/AiComposerPipelineFooter';
import { type PipelineNode } from '../ee/features/aiCopilot/components/ChatElements/composerPipelineDag';
import { type ComposerQueryNodeStatus } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/descriptions/ComposerQueriesToolCallDescription';

/** A fan-in DAG: three sources, one intermediate join, one final join. */
const dagNodes: PipelineNode[] = [
    {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'order_counts',
        title: 'Orders by status',
        description: 'Governed unique order count per status.',
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_unique_order_count'],
        filters: null,
        sorts: null,
        limit: 1000,
    },
    {
        sourceType: QuerySourceType.SQL,
        nodeId: 'avg_amounts',
        title: 'Average order amount',
        description: 'Raw warehouse average per status.',
        sql: 'SELECT status, ROUND(AVG(amount)::numeric, 2) AS avg_amount FROM jaffle.orders GROUP BY status',
        limit: 1000,
    },
    {
        sourceType: QuerySourceType.EXTERNAL,
        nodeId: 'targets',
        title: 'Status targets',
        description: 'Uploaded CSV of target order counts.',
        sql: 'SELECT status, target_orders FROM targets_csv',
        tables: { targets_csv: 'targets.csv' },
        limit: 1000,
    },
    {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'actuals',
        title: 'Actuals per status',
        description: 'Order counts joined with average amount.',
        sql: 'SELECT oc.orders_status AS status, oc.orders_unique_order_count AS order_count, aa.avg_amount FROM order_counts AS oc JOIN avg_amounts AS aa ON oc.orders_status = aa.status',
        references: ['order_counts', 'avg_amounts'],
        limit: 1000,
    },
    {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'vs_target',
        title: 'Actuals vs target',
        description: 'Adds target and attainment per status.',
        sql: 'SELECT a.status, a.order_count, a.avg_amount, t.target_orders, ROUND(a.order_count * 100.0 / t.target_orders, 1) AS attainment_pct FROM actuals AS a LEFT JOIN targets AS t USING (status) ORDER BY a.order_count DESC',
        references: ['actuals', 'targets'],
        limit: 1000,
    },
];

const linearNodes: PipelineNode[] = [
    dagNodes[0],
    dagNodes[1],
    {
        ...dagNodes[3],
        nodeId: 'joined',
        title: 'Orders with average amount',
    },
];

const rows = [
    ['completed', 97, '25.50', 100, '97.0'],
    ['shipped', 26, '29.64', 30, '86.7'],
    ['placed', 22, '40.44', 20, '110.0'],
    ['returned', 4, '13.50', 5, '80.0'],
    ['return_pending', 2, '19.00', 2, '100.0'],
] as const;

const success = (
    nodes: PipelineNode[],
): Record<string, ComposerQueryNodeStatus> =>
    Object.fromEntries(
        nodes.map((node) => [node.nodeId, { status: 'success' }]),
    );

type ArtifactProps = {
    nodes: PipelineNode[];
    terminalNodeId: string;
    nodeStatuses?: Record<string, ComposerQueryNodeStatus>;
    durationLabel: string | null;
    defaultExpanded?: boolean;
    showTable?: boolean;
};

const ResultsTable = () => (
    <Paper radius="md" bg="ldGray.0" withBorder>
        <Table fz="xs" highlightOnHover>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>status</Table.Th>
                    <Table.Th ta="right">order_count</Table.Th>
                    <Table.Th ta="right">avg_amount</Table.Th>
                    <Table.Th ta="right">target_orders</Table.Th>
                    <Table.Th ta="right">attainment_pct</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {rows.map(([status, count, avg, target, pct]) => (
                    <Table.Tr key={status}>
                        <Table.Td>{status}</Table.Td>
                        <Table.Td ta="right">{count}</Table.Td>
                        <Table.Td ta="right">{avg}</Table.Td>
                        <Table.Td ta="right">{target}</Table.Td>
                        <Table.Td ta="right">{pct}</Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    </Paper>
);

/** Mock of the floating artifact panel at its real size. */
const ComposerArtifact = ({
    nodes,
    terminalNodeId,
    nodeStatuses,
    durationLabel,
    defaultExpanded,
    showTable = true,
}: ArtifactProps) => (
    <Box w={760} h={900}>
        <Box className={panelStyles.floatingPanel}>
            <Box className={panelStyles.floatingContent} p={0}>
                <AiComposerPipelinePanel
                    nodes={nodes}
                    terminalNodeId={terminalNodeId}
                    nodeStatuses={nodeStatuses}
                    durationLabel={durationLabel}
                    defaultExpanded={defaultExpanded}
                >
                    <Stack gap="md" h="100%" mih={0} px="md" pt="sm" pb="md">
                        <Box className={panelStyles.head}>
                            <Stack gap={0} flex={1} miw={0}>
                                <Text fz="sm" fw={600}>
                                    Orders by status vs target
                                </Text>
                                <Text fz="xs" c="dimmed">
                                    Semantic-layer order counts, warehouse
                                    average amount and uploaded targets.
                                </Text>
                            </Stack>
                            <Group gap={2} className={panelStyles.headRight}>
                                <ActionIcon size="sm" aria-label="Close">
                                    <MantineIcon icon={IconX} />
                                </ActionIcon>
                            </Group>
                        </Box>
                        <Box flex={1} mih={0} style={{ overflow: 'auto' }}>
                            {showTable ? (
                                <ResultsTable />
                            ) : (
                                <Text fz="xs" c="dimmed" ta="center" pt="xl">
                                    Running composer queries...
                                </Text>
                            )}
                        </Box>
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
        nodes: dagNodes,
        terminalNodeId: 'vs_target',
        nodeStatuses: success(dagNodes),
        durationLabel: '1.8s',
    },
} satisfies Meta<typeof ComposerArtifact>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DagCollapsed: Story = {};

export const DagExpanded: Story = {
    args: { defaultExpanded: true },
};

export const LinearCollapsed: Story = {
    args: {
        nodes: linearNodes,
        terminalNodeId: 'joined',
        nodeStatuses: success(linearNodes),
        durationLabel: '1.2s',
    },
};

export const Running: Story = {
    args: {
        showTable: false,
        durationLabel: null,
        nodeStatuses: {
            order_counts: { status: 'success' },
            avg_amounts: { status: 'running' },
            targets: { status: 'success' },
            actuals: { status: 'pending' },
            vs_target: { status: 'pending' },
        },
    },
};

export const Failed: Story = {
    args: {
        showTable: false,
        durationLabel: '0.8s',
        defaultExpanded: true,
        nodeStatuses: {
            order_counts: { status: 'success' },
            avg_amounts: {
                status: 'error',
                errorMessage: 'relation "jaffle.order" does not exist',
            },
            targets: { status: 'success' },
            actuals: {
                status: 'error',
                errorMessage: 'Upstream node avg_amounts failed',
            },
            vs_target: {
                status: 'error',
                errorMessage: 'Upstream node actuals failed',
            },
        },
    },
};
