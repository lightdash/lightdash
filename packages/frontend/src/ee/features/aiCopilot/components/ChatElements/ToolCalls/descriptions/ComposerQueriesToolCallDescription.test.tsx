import { QuerySourceType, type ToolComposerQueryNode } from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../../testing/testUtils';
import { store } from '../../../../store';
import { ComposerQueriesToolCallDescription } from './ComposerQueriesToolCallDescription';

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
