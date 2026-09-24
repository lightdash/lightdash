// PROTOTYPE — throwaway. Two variants of the live composer pipeline inside
// the activity card. Switch with the `variant` and `phase` controls.
import { QuerySourceType, type ToolComposerQueryNode } from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconChevronRight, IconStack2 } from '@tabler/icons-react';
import MantineIcon from '../components/common/MantineIcon';
import cardStyles from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/LiveActivityCard.module.css';
import {
    VariantA,
    VariantB,
    type PrototypeNodeStatus,
} from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/prototype/ComposerPipelinePrototype';
import { ToolCallRow } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/ToolCallRow';
import type { ToolCallSummary } from '../ee/features/aiCopilot/components/ChatElements/ToolCalls/utils/types';

const queries: ToolComposerQueryNode[] = [
    {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'order_counts',
        title: 'Unique orders by status',
        description: null,
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_unique_order_count'],
        filters: null,
        sorts: null,
        limit: 500,
    },
    {
        sourceType: QuerySourceType.SQL,
        nodeId: 'payment_averages',
        title: 'Average payments by status',
        description: null,
        sql: 'SELECT o.status AS order_status, AVG(p.amount) AS average_payment_amount FROM jaffle.payments AS p JOIN jaffle.orders AS o ON o.order_id = p.order_id GROUP BY o.status',
        limit: 500,
    },
    {
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'result',
        title: 'Order status analysis',
        description: null,
        sql: 'SELECT c.orders_status AS order_status, c.orders_unique_order_count AS unique_order_count, p.average_payment_amount FROM order_counts AS c LEFT JOIN payment_averages AS p ON c.orders_status = p.order_status ORDER BY unique_order_count DESC',
        references: ['order_counts', 'payment_averages'],
        limit: 500,
    },
];

type Phase =
    | 'running-1'
    | 'awaiting-approval'
    | 'running-2'
    | 'running-3'
    | 'error-2'
    | 'done';

const S = (
    a: PrototypeNodeStatus['status'],
    b: PrototypeNodeStatus['status'],
    c: PrototypeNodeStatus['status'],
): Record<string, PrototypeNodeStatus> => {
    const mk = (s: PrototypeNodeStatus['status']): PrototypeNodeStatus =>
        s === 'error'
            ? {
                  status: 'error',
                  errorMessage: 'relation "jaffle.payments" does not exist',
              }
            : { status: s };
    return { order_counts: mk(a), payment_averages: mk(b), result: mk(c) };
};

const phases: Record<Phase, Record<string, PrototypeNodeStatus>> = {
    'running-1': S('running', 'pending', 'pending'),
    'awaiting-approval': S('success', 'awaiting_approval', 'pending'),
    'running-2': S('success', 'running', 'pending'),
    'running-3': S('success', 'success', 'running'),
    'error-2': S('success', 'error', 'pending'),
    done: S('success', 'success', 'success'),
};

const history: ToolCallSummary[] = [
    {
        toolCallId: 'find-explores',
        toolName: 'findExplores',
        toolArgs: { searchQuery: 'orders payments' },
    },
    {
        toolCallId: 'find-fields',
        toolName: 'findFields',
        toolArgs: {
            fieldSearchQueries: [
                { label: 'order status', fieldTypes: ['dimension'] },
            ],
        },
    },
];

type Args = { variant: 'A' | 'B'; phase: Phase };

// Mimics LiveActivityCard's frame so the variant butts up against real rows.
const Harness = ({ variant, phase }: Args) => {
    const isLive = phase !== 'done';
    const statuses = phases[phase];
    const Variant = variant === 'A' ? VariantA : VariantB;
    const awaiting = phase === 'awaiting-approval';
    return (
        <Box maw={720} p="lg">
            <Box
                className={cardStyles.card}
                data-live={isLive ? 'true' : 'false'}
                data-expanded="true"
            >
                <Group gap={6} align="center" wrap="nowrap">
                    <Group
                        gap={8}
                        align="center"
                        wrap="nowrap"
                        className={cardStyles.latestRow}
                    >
                        <Box
                            className={cardStyles.iconChip}
                            data-live={isLive ? 'true' : 'false'}
                        >
                            <MantineIcon
                                icon={IconStack2}
                                size={12}
                                stroke={1.7}
                                className={cardStyles.latestIcon}
                                data-live={isLive ? 'true' : 'false'}
                            />
                        </Box>
                        <Text
                            size="xs"
                            className={cardStyles.latestLabel}
                            data-live={isLive ? 'true' : 'false'}
                        >
                            {isLive
                                ? 'Running composer queries'
                                : 'Ran composer queries'}
                        </Text>
                        <Text
                            size="xs"
                            c="dimmed"
                            lineClamp={1}
                            className={cardStyles.latestPreview}
                        >
                            {awaiting
                                ? 'awaiting approval'
                                : 'Order count and average payment by status'}
                        </Text>
                    </Group>
                    <Text size="xs" className={cardStyles.counter}>
                        +2
                    </Text>
                    <MantineIcon
                        icon={IconChevronRight}
                        size={11}
                        stroke={1.6}
                        className={`${cardStyles.chevron} ${cardStyles.chevronOpen}`}
                    />
                </Group>
                <Stack gap={6} className={cardStyles.history}>
                    <Variant
                        queries={queries}
                        nodeStatuses={statuses}
                        isLive={isLive}
                    />
                    <Stack gap={2}>
                        <ToolCallRow
                            toolName="findFields"
                            toolCalls={history}
                            status="done"
                            display={{
                                liveLabel: 'Searching the data model',
                                doneLabel: 'Searched the data model',
                            }}
                        />
                    </Stack>
                </Stack>
            </Box>
        </Box>
    );
};

const meta: Meta<Args> = {
    title: 'AI Copilot/Composer Pipeline Prototype',
    render: (args) => <Harness {...args} />,
    args: { variant: 'A', phase: 'running-2' },
    argTypes: {
        variant: { control: 'inline-radio', options: ['A', 'B'] },
        phase: {
            control: 'select',
            options: [
                'running-1',
                'awaiting-approval',
                'running-2',
                'running-3',
                'error-2',
                'done',
            ],
        },
    },
};

export default meta;
type Story = StoryObj<Args>;

export const A_StepRows: Story = { args: { variant: 'A' } };
export const A_AwaitingApproval: Story = {
    args: { variant: 'A', phase: 'awaiting-approval' },
};
export const B_FocusPane: Story = { args: { variant: 'B' } };
export const B_AwaitingApproval: Story = {
    args: { variant: 'B', phase: 'awaiting-approval' },
};
