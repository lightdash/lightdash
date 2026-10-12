import { QuerySourceType, type ToolComposerQueryNode } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../../testing/testUtils';
import { useCanViewAiAgentSql } from '../../../../hooks/useCanViewAiAgentSql';
import { store } from '../../../../store';
import { ComposerQueriesToolCallDescription } from './ComposerQueriesToolCallDescription';

vi.mock('../../../../hooks/useCanViewAiAgentSql', () => ({
    useCanViewAiAgentSql: vi.fn(() => true),
}));

const sqlNode = (nodeId: string, title: string, sql: string) =>
    ({
        sourceType: QuerySourceType.SQL,
        nodeId,
        title,
        description: null,
        sql,
        limit: 500,
    }) satisfies ToolComposerQueryNode;

describe('ComposerQueriesToolCallDescription', () => {
    beforeEach(() => {
        vi.mocked(useCanViewAiAgentSql).mockReturnValue(true);
    });

    it('renders node titles and source context, with SQL behind a collapsed row', async () => {
        const { container } = renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[
                    {
                        sourceType: QuerySourceType.EXTERNAL,
                        nodeId: 'targets',
                        title: 'Revenue targets',
                        description: null,
                        sql: 'select payment_method,target_revenue from targets_csv',
                        tables: { targets_csv: 'table-uuid' },
                        limit: 500,
                    },
                    {
                        sourceType: QuerySourceType.DUCKDB,
                        nodeId: 'comparison',
                        title: 'Actual vs target',
                        description: null,
                        sql: 'select * from actual join targets using (payment_method)',
                        references: { a: 'actual', t: 'targets' },
                        limit: 500,
                    },
                ]}
            />,
        );

        expect(screen.getByText('Revenue targets')).toBeInTheDocument();
        expect(screen.getByText('Actual vs target')).toBeInTheDocument();
        expect(screen.queryByText('comparison')).not.toBeInTheDocument();
        expect(screen.getByText('External data')).toBeInTheDocument();
        expect(screen.getByText('Reads targets_csv')).toBeInTheDocument();
        expect(screen.getByText('DuckDB compose')).toBeInTheDocument();
        // Node references read by title; a queryUuid or unknown id stays as-is
        expect(
            screen.getByText('Reads actual, Revenue targets'),
        ).toBeInTheDocument();

        const rows = screen.getAllByRole('button', { expanded: false });
        expect(rows).toHaveLength(2);

        await userEvent.click(rows[0]);
        expect(rows[0]).toHaveAttribute('aria-expanded', 'true');
        expect(container.querySelector('code')).toHaveTextContent(
            'select payment_method, target_revenue from targets_csv',
        );
    });

    it('hides node SQL without the SQL scope but keeps the card readable', () => {
        vi.mocked(useCanViewAiAgentSql).mockReturnValue(false);
        const { container } = renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[sqlNode('orders', 'Orders', 'select secret from t')]}
                nodeStatuses={{ orders: { status: 'running' } }}
            />,
        );

        expect(screen.getByText('Orders')).toBeInTheDocument();
        expect(screen.getByText('Warehouse SQL')).toBeInTheDocument();
        expect(container.querySelector('code')).not.toBeInTheDocument();
        expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
    });

    it('opens only the running node and marks the rest with their status', () => {
        renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[
                    sqlNode('orders', 'Orders', 'select 1'),
                    sqlNode('revenue', 'Revenue', 'select 2'),
                    {
                        sourceType: QuerySourceType.DUCKDB,
                        nodeId: 'combined',
                        title: 'Orders and revenue',
                        description: null,
                        sql: 'select * from orders join revenue on true',
                        references: ['orders', 'revenue'],
                        limit: 500,
                    },
                ]}
                nodeStatuses={{
                    orders: { status: 'success' },
                    revenue: { status: 'running' },
                    combined: { status: 'pending' },
                }}
            />,
        );

        expect(screen.getByLabelText('Completed')).toBeInTheDocument();
        expect(screen.getByLabelText('Running')).toBeInTheDocument();
        expect(screen.getByLabelText('Queued')).toBeInTheDocument();

        expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(
            1,
        );
        expect(
            screen.getByRole('button', { expanded: true }),
        ).toHaveTextContent('Revenue');
    });

    it('opens failed nodes so the error is inspectable', () => {
        renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[
                    sqlNode('orders', 'Orders', 'select 1'),
                    sqlNode('broken', 'Broken step', 'select broken'),
                ]}
                nodeStatuses={{
                    orders: { status: 'success' },
                    broken: {
                        status: 'error',
                        errorMessage: 'column not found',
                    },
                }}
            />,
        );

        expect(
            screen.getByLabelText('Failed: column not found'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { expanded: true }),
        ).toHaveTextContent('Broken step');
    });

    it('lists a python node with its badge, reads and code', async () => {
        const { container } = renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[
                    sqlNode('orders', 'Orders', 'select 1'),
                    {
                        sourceType: QuerySourceType.PYTHON,
                        nodeId: 'sim',
                        title: 'Simulated amounts',
                        description: null,
                        code: 'def run(inputs, params):\n    return inputs["orders"]',
                        references: ['orders'],
                        limit: 500,
                    },
                ]}
            />,
        );

        expect(screen.getByText('Python')).toBeInTheDocument();
        expect(screen.getByText('Reads Orders')).toBeInTheDocument();
        await userEvent.click(
            screen.getByRole('button', { name: /Simulated amounts/ }),
        );
        const codes = [...container.querySelectorAll('code')].map(
            (code) => code.textContent,
        );
        expect(codes.some((code) => code?.includes('def run('))).toBe(true);
    });

    it('renders a partially streamed python node without code', () => {
        const { container } = renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[
                    {
                        sourceType: QuerySourceType.PYTHON,
                        nodeId: 'sim',
                        title: 'sim',
                        description: null,
                        code: '',
                        references: [],
                        limit: 500,
                    },
                ]}
                nodeStatuses={{ sim: { status: 'running' } }}
            />,
        );

        expect(screen.getByText('Python')).toBeInTheDocument();
        expect(container.querySelector('code')).not.toBeInTheDocument();
    });

    it('shows a failed node error as a readable block', () => {
        const traceback =
            'Traceback (most recent call last):\n  File "<node>", line 2, in run\nZeroDivisionError: division by zero';
        renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[
                    {
                        sourceType: QuerySourceType.PYTHON,
                        nodeId: 'sim',
                        title: 'Simulated amounts',
                        description: null,
                        code: 'def run(inputs, params):\n    return 1 / 0',
                        references: ['orders'],
                        limit: 500,
                    },
                ]}
                nodeStatuses={{
                    sim: { status: 'error', errorMessage: traceback },
                }}
            />,
        );

        const block = screen.getByText(/ZeroDivisionError/);
        expect(block.tagName).toBe('PRE');
        expect(block.textContent).toBe(traceback);
    });

    it('shows a failed call error when no node carries its own', () => {
        renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[sqlNode('orders', 'Orders', 'select 1')]}
                failure="Composer query failed on node(s): orders"
            />,
        );

        expect(
            screen.getByText('Composer query failed on node(s): orders')
                .tagName,
        ).toBe('PRE');
    });

    it('prefers node errors over the call error', () => {
        renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[sqlNode('orders', 'Orders', 'select 1')]}
                nodeStatuses={{
                    orders: { status: 'error', errorMessage: 'bad column' },
                }}
                failure="call failed"
            />,
        );

        expect(screen.getByText('bad column')).toBeInTheDocument();
        expect(screen.queryByText('call failed')).not.toBeInTheDocument();
    });

    it('hides a failed node error without the SQL scope', () => {
        vi.mocked(useCanViewAiAgentSql).mockReturnValue(false);
        const { container } = renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[sqlNode('broken', 'Broken', 'select broken')]}
                nodeStatuses={{
                    broken: { status: 'error', errorMessage: 'bad column' },
                }}
            />,
        );

        expect(container.querySelector('pre')).not.toBeInTheDocument();
    });

    it('shows approval actions under SQL nodes awaiting approval', () => {
        renderWithProviders(
            <Provider store={store}>
                <ComposerQueriesToolCallDescription
                    queries={[
                        sqlNode('orders', 'Orders', 'select 1'),
                        {
                            sourceType: QuerySourceType.DUCKDB,
                            nodeId: 'combined',
                            title: 'Combined',
                            description: null,
                            sql: 'select * from orders',
                            references: ['orders'],
                            limit: 500,
                        },
                    ]}
                    nodeStatuses={{
                        orders: { status: 'awaiting_approval' },
                        combined: { status: 'pending' },
                    }}
                    approval={{
                        projectUuid: 'project',
                        agentUuid: 'agent',
                        threadUuid: 'thread',
                        toolCallId: 'call',
                    }}
                />
            </Provider>,
        );

        expect(screen.getByLabelText('Awaiting approval')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { expanded: true }),
        ).toHaveTextContent('Orders');
        expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible();
        expect(screen.getByRole('button', { name: 'Reject' })).toBeVisible();
    });

    it('renders one approval for a pipeline with several SQL nodes', () => {
        renderWithProviders(
            <Provider store={store}>
                <ComposerQueriesToolCallDescription
                    queries={[
                        sqlNode('orders', 'Orders', 'select 1'),
                        sqlNode('payments', 'Payments', 'select 2'),
                    ]}
                    nodeStatuses={{
                        orders: { status: 'awaiting_approval' },
                        payments: { status: 'awaiting_approval' },
                    }}
                    approval={{
                        projectUuid: 'project',
                        agentUuid: 'agent',
                        threadUuid: 'thread',
                        toolCallId: 'call',
                    }}
                />
            </Provider>,
        );

        expect(screen.getAllByLabelText('Awaiting approval')).toHaveLength(2);
        expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(
            1,
        );
    });

    it('renders no status indicators for the persisted view', () => {
        renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[sqlNode('orders', 'Orders', 'select 1')]}
            />,
        );

        expect(screen.queryByLabelText('Completed')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Queued')).not.toBeInTheDocument();
    });
});
