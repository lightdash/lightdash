import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { ChartTypeRowsModal } from './ChartTypeSampleData';

describe('ChartTypeRowsModal', () => {
    it('shows result columns and an empty state when a query returns no rows', async () => {
        renderWithProviders(
            <ChartTypeRowsModal
                data={{
                    rows: [],
                    pivotDetails: null,
                    labels: {
                        orders_status: 'Status',
                        orders_revenue: 'Revenue',
                    },
                }}
                opened
                onClose={vi.fn()}
                title="Query results"
                subtitle="Rows returned by Orders."
            />,
        );

        const dialog = await screen.findByRole('dialog', {
            name: 'Query results',
        });
        expect(
            within(dialog).getByRole('columnheader', { name: 'Status' }),
        ).toBeVisible();
        expect(
            within(dialog).getByRole('columnheader', { name: 'Revenue' }),
        ).toBeVisible();
        expect(within(dialog).getByText('No records yet')).toBeVisible();
    });

    it('stays hidden when neither rows nor result columns exist', () => {
        renderWithProviders(
            <ChartTypeRowsModal
                data={{ rows: [], pivotDetails: null, labels: {} }}
                opened
                onClose={vi.fn()}
                title="Query results"
                subtitle="Rows returned by Orders."
            />,
        );

        expect(
            screen.queryByRole('dialog', { name: 'Query results' }),
        ).not.toBeInTheDocument();
    });
});
