import { QuerySourceType } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../../testing/testUtils';
import { ComposerQueriesToolCallDescription } from './ComposerQueriesToolCallDescription';

describe('ComposerQueriesToolCallDescription', () => {
    it('renders node titles, source context and formatted SQL for a composed pipeline', () => {
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
        expect(screen.getAllByRole('button', { name: 'Copy' })).toHaveLength(2);
        expect(container.querySelector('code')).toHaveTextContent(
            'select payment_method, target_revenue from targets_csv',
        );
    });

    it('renders a live status indicator per node when statuses are provided', () => {
        renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[
                    {
                        sourceType: QuerySourceType.SQL,
                        nodeId: 'orders',
                        title: 'Orders',
                        description: null,
                        sql: 'select 1',
                        limit: 500,
                    },
                    {
                        sourceType: QuerySourceType.SQL,
                        nodeId: 'revenue',
                        title: 'Revenue',
                        description: null,
                        sql: 'select 2',
                        limit: 500,
                    },
                    {
                        sourceType: QuerySourceType.DUCKDB,
                        nodeId: 'combined',
                        title: 'Orders and revenue',
                        description: null,
                        sql: 'select * from orders join revenue on true',
                        references: ['orders', 'revenue'],
                        limit: 500,
                    },
                    {
                        sourceType: QuerySourceType.DUCKDB,
                        nodeId: 'failed',
                        title: 'Broken step',
                        description: null,
                        sql: 'select broken',
                        references: ['combined'],
                        limit: 500,
                    },
                ]}
                nodeStatuses={{
                    orders: { status: 'success' },
                    revenue: { status: 'running' },
                    combined: { status: 'pending' },
                    failed: {
                        status: 'error',
                        errorMessage: 'column not found',
                    },
                }}
            />,
        );

        expect(screen.getByLabelText('Completed')).toBeInTheDocument();
        expect(screen.getByLabelText('Running')).toBeInTheDocument();
        expect(screen.getByLabelText('Queued')).toBeInTheDocument();
        expect(
            screen.getByLabelText('Failed: column not found'),
        ).toBeInTheDocument();
    });

    it('renders no status indicators for the persisted view', () => {
        renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[
                    {
                        sourceType: QuerySourceType.SQL,
                        nodeId: 'orders',
                        title: 'Orders',
                        description: null,
                        sql: 'select 1',
                        limit: 500,
                    },
                ]}
            />,
        );

        expect(screen.queryByLabelText('Completed')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Queued')).not.toBeInTheDocument();
    });
});
