import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
    createExplorerStore,
    explorerActions,
    useExplorerDispatch,
} from '../features/explorer/store';
import { defaultState } from '../providers/Explorer/defaultState';
import { renderWithProviders } from '../testing/testUtils';
import {
    parseIsFieldSidebarOpen,
    useExplorerSidebarUrlState,
} from './useExplorerSidebarUrlState';

const Harness = () => {
    const dispatch = useExplorerDispatch();
    const location = useLocation();
    useExplorerSidebarUrlState();

    return (
        <>
            <div data-testid="search">{location.search}</div>
            <button
                onClick={() => dispatch(explorerActions.toggleFieldSidebar())}
            >
                Toggle
            </button>
        </>
    );
};

describe('useExplorerSidebarUrlState', () => {
    it('treats an absent or unknown value as an open sidebar', () => {
        expect(parseIsFieldSidebarOpen('')).toBe(true);
        expect(parseIsFieldSidebarOpen('?fieldSidebar=open')).toBe(true);
        expect(parseIsFieldSidebarOpen('?fieldSidebar=nope')).toBe(true);
    });

    it('restores the closed state from the URL', () => {
        expect(
            parseIsFieldSidebarOpen('?fieldSidebar=closed&fromSpace=space-1'),
        ).toBe(false);
    });

    it('persists toggles while preserving other query parameters', async () => {
        const store = createExplorerStore({
            explorer: {
                ...defaultState,
                isFieldSidebarOpen: true,
            },
        });

        renderWithProviders(
            <Provider store={store}>
                <MemoryRouter
                    initialEntries={['/projects/project-1/tables/orders?x=1']}
                >
                    <Harness />
                </MemoryRouter>
            </Provider>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));

        await waitFor(() => {
            const params = new URLSearchParams(
                screen.getByTestId('search').textContent ?? '',
            );
            expect(params.get('x')).toBe('1');
            expect(params.get('fieldSidebar')).toBe('closed');
        });

        fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));

        await waitFor(() => {
            const params = new URLSearchParams(
                screen.getByTestId('search').textContent ?? '',
            );
            expect(params.get('x')).toBe('1');
            expect(params.get('fieldSidebar')).toBeNull();
        });
    });
});
