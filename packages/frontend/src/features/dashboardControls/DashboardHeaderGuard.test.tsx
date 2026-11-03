import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type DashboardHeader from '../../components/common/Dashboard/DashboardHeader';
import { DashboardHeaderGuard } from './DashboardHeaderGuard';

const mockSidebar = vi.hoisted(() => ({
    current: { isSidebarOpen: true, isViewer: false },
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: typeof mockSidebar.current) => unknown,
    ) => selector(mockSidebar.current),
}));
vi.mock('../../components/common/Dashboard/DashboardHeader', () => ({
    default: () => (
        <header>
            <button>Save changes</button>
            <button>Cancel</button>
        </header>
    ),
}));

const renderGuard = () =>
    render(
        <MantineProvider>
            <DashboardHeaderGuard
                {...({} as ComponentProps<typeof DashboardHeader>)}
            />
        </MantineProvider>,
    );

const button = (name: string) =>
    screen.getByRole('button', { name, hidden: true });

describe('DashboardHeaderGuard', () => {
    beforeEach(() => {
        mockSidebar.current = { isSidebarOpen: false, isViewer: false };
    });

    it('renders the shipped header, unlocked', () => {
        renderGuard();
        expect(button('Save changes')).toBeInTheDocument();
        expect(document.querySelector('[inert]')).toBeNull();
    });

    it('makes the whole header inert while an editor edits a filter', () => {
        mockSidebar.current = { isSidebarOpen: true, isViewer: false };
        renderGuard();
        expect(button('Save changes').closest('[inert]')).not.toBeNull();
        expect(button('Cancel').closest('[inert]')).not.toBeNull();
    });

    it('never locks the header while a viewer edits their filters', () => {
        mockSidebar.current = { isSidebarOpen: true, isViewer: true };
        renderGuard();
        expect(document.querySelector('[inert]')).toBeNull();
    });
});
