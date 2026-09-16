import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockViewport } from '../../../testing/mockViewport';
import { renderWithProviders } from '../../../testing/testUtils';
import Page from './Page';

const StatefulSidebar = () => {
    const [search, setSearch] = useState('');
    return (
        <input
            aria-label="Sidebar search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
        />
    );
};

afterEach(() => vi.restoreAllMocks());

describe('Page resize', () => {
    it.each(['left', 'right'] as const)(
        'preserves %s sidebar input through drawer and desktop transitions',
        (side) => {
            const viewport = mockViewport(1024);
            renderWithProviders(
                <Page
                    withNavbar={false}
                    sidebar={side === 'left' ? <StatefulSidebar /> : undefined}
                    rightSidebar={
                        side === 'right' ? <StatefulSidebar /> : undefined
                    }
                    isRightSidebarOpen
                    keepRightSidebarMounted
                    onRightSidebarClose={() => {}}
                >
                    Main content
                </Page>,
            );
            const input = screen.getByRole('textbox', {
                name: 'Sidebar search',
            });
            fireEvent.change(input, { target: { value: 'orders' } });

            viewport.resize(744);
            if (side === 'left')
                fireEvent.click(
                    screen.getByRole('button', { name: 'Navigation' }),
                );
            expect(
                screen.getByRole('textbox', { name: 'Sidebar search' }),
            ).toBe(input);
            expect(input).toHaveValue('orders');

            viewport.resize(1024);
            expect(
                screen.getByRole('textbox', { name: 'Sidebar search' }),
            ).toBe(input);
            expect(input).toHaveValue('orders');
        },
    );
});
