import { type DataAppConsumerAccess } from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import AppConsumerAccessIndicator from './AppConsumerAccessIndicator';

const location = { path: 'src/Table.tsx', line: 12, column: 5 };

const limited: DataAppConsumerAccess = {
    status: 'limited',
    queryCount: 3,
    issues: [
        {
            kind: 'query',
            explore: 'payments',
            unresolved: ['sorts', 'filters'],
            location,
        },
        {
            kind: 'globalFilter',
            explore: null,
            unresolved: ['explore', 'field'],
            location: { path: 'src/Filters.tsx', line: 4, column: 1 },
        },
    ],
};

describe('AppConsumerAccessIndicator', () => {
    it('shows nothing when every query is available', () => {
        renderWithProviders(
            <AppConsumerAccessIndicator
                access={{ status: 'available', queryCount: 2, issues: [] }}
            />,
        );
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('lists what Viewers cannot load and where it is', async () => {
        renderWithProviders(<AppConsumerAccessIndicator access={limited} />);

        fireEvent.click(
            screen.getByRole('button', { name: 'Limited for Viewers' }),
        );

        expect(
            await screen.findByText(
                "Viewers can't load some of this app's data",
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('A query on payments')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Its sorting and filters can change while the app runs',
            ),
        ).toBeInTheDocument();
        expect(screen.getByText('src/Table.tsx:12')).toBeInTheDocument();
        expect(screen.getByText('A filter across the app')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Its table and field can change while the app runs',
            ),
        ).toBeInTheDocument();
    });

    it('says to build a new version when nothing was saved for this one', async () => {
        renderWithProviders(
            <AppConsumerAccessIndicator
                access={{ status: 'unavailable', queryCount: 0, issues: [] }}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: 'Not available to Viewers' }),
        );

        expect(
            await screen.findByText("Viewers can't load this app's data"),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Build a new version to open it/),
        ).toBeInTheDocument();
    });
});
