import {
    QuerySourceType,
    type AiAgentMessageQueryPipeline,
    type ThreadComposerQueryNode,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconCopy, IconThumbDown, IconThumbUp } from '@tabler/icons-react';
import { type ComponentProps } from 'react';
import { fn } from 'storybook/test';
import MantineIcon from '../components/common/MantineIcon';
import {
    MessageQueriesList,
    MessageQueriesToggle,
} from '../ee/features/aiCopilot/components/ChatElements/MessageQueryPipelines';

const revenueByRegion: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'revenue_by_region',
    title: 'Monthly revenue by region',
    exploreName: 'orders',
    dimensions: ['orders_order_month', 'customers_region'],
    metrics: ['orders_total_revenue'],
};

const refunds: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'refunds',
    title: 'Raw refunds',
    sql: 'select * from refunds',
};

const netRevenue: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'net_revenue',
    title: 'Net revenue',
    description: 'Revenue minus refunds per region and month',
    sql: 'select ...',
    references: ['revenue_by_region', 'refunds'],
};

const forecast: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.PYTHON,
    nodeId: 'forecast',
    code: 'def run(inputs, params): ...',
    references: ['net_revenue'],
};

const targets: ThreadComposerQueryNode = {
    sourceType: QuerySourceType.EXTERNAL,
    nodeId: 'targets',
    title: 'Regional targets',
    sql: 'select * from targets',
    tables: { targets: 'tbl-targets' },
};

const netRevenuePipeline: AiAgentMessageQueryPipeline = {
    queryUuid: 'q-1',
    title: 'Net revenue by region',
    terminalNodeId: 'net_revenue',
    nodes: [revenueByRegion, refunds, netRevenue],
};

const revenuePipeline: AiAgentMessageQueryPipeline = {
    queryUuid: 'q-2',
    title: 'Monthly revenue by region',
    terminalNodeId: 'revenue_by_region',
    nodes: [revenueByRegion],
};

const forecastPipeline: AiAgentMessageQueryPipeline = {
    queryUuid: 'q-3',
    title: 'Revenue forecast against regional targets',
    terminalNodeId: 'forecast',
    nodes: [revenueByRegion, refunds, netRevenue, forecast, targets],
};

const targetsPipeline: AiAgentMessageQueryPipeline = {
    queryUuid: 'q-4',
    title: 'Regional targets from a very long uploaded spreadsheet name',
    terminalNodeId: 'targets',
    nodes: [targets],
};

const refundsPipeline: AiAgentMessageQueryPipeline = {
    queryUuid: 'q-5',
    title: 'Raw refunds',
    terminalNodeId: 'refunds',
    nodes: [refunds],
};

type Args = ComponentProps<typeof MessageQueriesList> & {
    defaultExpanded: boolean;
};

/** Mimics the assistant message footer the control sits in. */
const Scenario = ({ defaultExpanded, pipelines, onSelect }: Args) => {
    const [expanded, { toggle }] = useDisclosure(defaultExpanded);
    return (
        <Box maw={720} p="xl">
            <Stack gap="xs">
                <Text size="sm">
                    Revenue grew 12% month over month, led by EMEA. Refunds
                    stayed flat, so net revenue tracks gross closely.
                </Text>
                <Group gap={0}>
                    <ActionIcon color="ldGray.9" aria-label="copy">
                        <MantineIcon icon={IconCopy} />
                    </ActionIcon>
                    <ActionIcon color="ldGray.9" aria-label="upvote">
                        <MantineIcon icon={IconThumbUp} />
                    </ActionIcon>
                    <ActionIcon color="ldGray.9" aria-label="downvote">
                        <MantineIcon icon={IconThumbDown} />
                    </ActionIcon>
                    <MessageQueriesToggle
                        count={pipelines.length}
                        expanded={expanded}
                        onToggle={toggle}
                    />
                </Group>
                {expanded && (
                    <MessageQueriesList
                        pipelines={pipelines}
                        onSelect={onSelect}
                        selectedQueryUuid={null}
                    />
                )}
            </Stack>
        </Box>
    );
};

const meta: Meta<Args> = {
    title: 'AI Agent/MessageQueryPipelines',
    render: (args) => <Scenario {...args} />,
    args: {
        pipelines: [netRevenuePipeline, revenuePipeline],
        onSelect: fn(),
        defaultExpanded: false,
    },
};

export default meta;
type Story = StoryObj<Args>;

export const Collapsed: Story = {};

export const Expanded: Story = { args: { defaultExpanded: true } };

export const ManyPipelines: Story = {
    args: {
        defaultExpanded: true,
        pipelines: [
            netRevenuePipeline,
            revenuePipeline,
            forecastPipeline,
            targetsPipeline,
            refundsPipeline,
        ],
    },
};

export const SinglePipeline: Story = {
    args: { defaultExpanded: true, pipelines: [netRevenuePipeline] },
};
