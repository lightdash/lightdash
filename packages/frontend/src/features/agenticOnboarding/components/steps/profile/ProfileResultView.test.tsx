import { DimensionType, type ProfileResult } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { renderWithProviders } from '../../../../../testing/testUtils';
import ProfileResultView from './ProfileResultView';

vi.mock('../../DemoHatch', () => ({
    __esModule: true,
    default: () => null,
}));

const baseResult: ProfileResult = {
    tables: [
        {
            database: 'DB',
            schema: 'JAFFLE',
            name: 'ORDERS',
            tableType: 'table',
            rowCount: 48209,
            columns: [{ name: 'id', type: DimensionType.NUMBER }],
        },
        {
            database: 'DB',
            schema: 'JAFFLE',
            name: 'CUSTOMER_VIEW',
            tableType: 'view',
            rowCount: null,
            columns: [],
        },
    ],
    entities: [
        {
            database: 'DB',
            schema: 'JAFFLE',
            tableName: 'CUSTOMERS',
            label: 'Customers',
            description: '12.8K people who placed at least one order',
            rowCount: 12800,
            columnCount: 5,
            primaryKey: 'id',
            notes: [],
        },
    ],
    relationships: [
        {
            fromTable: 'ORDERS',
            fromColumn: 'customer_id',
            toTable: 'CUSTOMERS',
            toColumn: 'id',
            type: 'many_to_one',
            confidence: 'high',
        },
        {
            fromTable: 'ORDERS',
            fromColumn: 'promo_id',
            toTable: 'PROMOS',
            toColumn: 'id',
            type: 'many_to_one',
            confidence: 'low',
        },
    ],
    truncated: false,
    profiledAt: '2026-07-14T00:00:00.000Z',
};

describe('ProfileResultView', () => {
    it('renders the success banner, tables, entities and relationships', () => {
        renderWithProviders(
            <ProfileResultView
                result={baseResult}
                onContinue={vi.fn()}
                onBackToConnect={vi.fn()}
            />,
        );

        expect(
            screen.getByText('Connected — profiling schema JAFFLE'),
        ).toBeInTheDocument();
        // Formatted row count with thousands separator, and "—" for null.
        expect(screen.getByText('48,209')).toBeInTheDocument();
        expect(screen.getByText('—')).toBeInTheDocument();
        expect(screen.getByText('view')).toBeInTheDocument();
        expect(
            screen.getByText('12.8K people who placed at least one order'),
        ).toBeInTheDocument();
        expect(screen.getByText('high confidence')).toBeInTheDocument();
        expect(screen.getByText('low confidence')).toBeInTheDocument();
    });

    it('shows the truncated callout when truncated', () => {
        renderWithProviders(
            <ProfileResultView
                result={{ ...baseResult, truncated: true }}
                onContinue={vi.fn()}
                onBackToConnect={vi.fn()}
            />,
        );
        expect(
            screen.getByText('Showing the first 100 tables'),
        ).toBeInTheDocument();
    });

    it('fires onContinue from the primary CTA', () => {
        const onContinue = vi.fn();
        renderWithProviders(
            <ProfileResultView
                result={baseResult}
                onContinue={onContinue}
                onBackToConnect={vi.fn()}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Build my semantic layer' }),
        );
        expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it('renders an empty state with a back-to-connect action', () => {
        const onBackToConnect = vi.fn();
        renderWithProviders(
            <ProfileResultView
                result={{ ...baseResult, tables: [], entities: [] }}
                onContinue={vi.fn()}
                onBackToConnect={onBackToConnect}
            />,
        );
        expect(screen.getByText('No tables found')).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Back to connect' }),
        );
        expect(onBackToConnect).toHaveBeenCalledTimes(1);
    });
});
