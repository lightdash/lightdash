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
import {
    AiComposerPipelinePanel,
    type PipelineMode,
} from '../ee/features/aiCopilot/components/ChatElements/composerPipeline/AiComposerPipelinePanel';

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

const rows = [
    ['completed', 97, '25.50', 100, '97.0'],
    ['shipped', 26, '29.64', 30, '86.7'],
    ['placed', 22, '40.44', 20, '110.0'],
    ['returned', 4, '13.50', 5, '80.0'],
    ['return_pending', 2, '19.00', 2, '100.0'],
] as const;

const ResultsTable = () => (
    <Paper radius={0} bg="ldGray.0">
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

type ArtifactProps = {
    queries: SourceQuery[];
    terminalNodeId: string;
    defaultExpanded?: boolean;
    defaultMode?: PipelineMode;
};

/** The floating artifact panel at its real size, with a static results table. */
const ComposerArtifact = ({
    queries,
    terminalNodeId,
    defaultExpanded,
    defaultMode,
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
                        <ResultsTable />
                    </Stack>
                </AiComposerPipelinePanel>
            </Box>
        </Box>
    </Box>
);

const meta = {
    component: ComposerArtifact,
    title: 'AI Agent/Composer artifact',
    args: { queries: fanInQueries, terminalNodeId: 'vs_target' },
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
