import { QuerySourceType } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../../../../../testing/testUtils';
import { ComposerQueriesToolCallDescription } from './ComposerQueriesToolCallDescription';

describe('ComposerQueriesToolCallDescription', () => {
    it('renders source context and formatted SQL for a composed pipeline', () => {
        const { container } = renderWithProviders(
            <ComposerQueriesToolCallDescription
                queries={[
                    {
                        sourceType: QuerySourceType.EXTERNAL,
                        nodeId: 'targets',
                        sql: 'select payment_method,target_revenue from targets_csv',
                        tables: { targets_csv: 'table-uuid' },
                        limit: 500,
                    },
                    {
                        sourceType: QuerySourceType.DUCKDB,
                        nodeId: 'comparison',
                        sql: 'select * from actual join targets using (payment_method)',
                        references: ['actual', 'targets'],
                        limit: 500,
                    },
                ]}
            />,
        );

        expect(screen.getByText('External data')).toBeInTheDocument();
        expect(screen.getByText('Reads targets_csv')).toBeInTheDocument();
        expect(screen.getByText('DuckDB compose')).toBeInTheDocument();
        expect(
            screen.getByText('Combines actual, targets'),
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
                        sql: 'select 1',
                        limit: 500,
                    },
                    {
                        sourceType: QuerySourceType.SQL,
                        nodeId: 'revenue',
                        sql: 'select 2',
                        limit: 500,
                    },
                    {
                        sourceType: QuerySourceType.DUCKDB,
                        nodeId: 'combined',
                        sql: 'select * from orders join revenue on true',
                        references: ['orders', 'revenue'],
                        limit: 500,
                    },
                    {
                        sourceType: QuerySourceType.DUCKDB,
                        nodeId: 'failed',
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
