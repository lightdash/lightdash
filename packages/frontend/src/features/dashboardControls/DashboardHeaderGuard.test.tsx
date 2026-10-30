import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type DashboardHeader from '../../components/common/Dashboard/DashboardHeader';
import { DashboardHeaderGuard } from './DashboardHeaderGuard';

const mockSidebar = vi.hoisted(() => ({
    current: { isSidebarOpen: true, isViewer: false },
}));

const mockAccess = vi.hoisted(() => ({ userCanManageDashboard: true }));

vi.mock('../../components/common/Dashboard/useDashboardManageAccess', () => ({
    useDashboardManageAccess: () => mockAccess,
}));
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: typeof mockSidebar.current) => unknown,
    ) => selector(mockSidebar.current),
}));
// The shipped header's shape: a title, then Add tile beside Save and Cancel
vi.mock('../../components/common/Dashboard/DashboardHeader', () => ({
    default: ({
        onSaveDashboard,
        onCancel,
    }: ComponentProps<typeof DashboardHeader>) => (
        <header>
            <a href="#title">Title</a>
            <div>
                <button>Add tile</button>
                <button onClick={onSaveDashboard}>Save changes</button>
                <button onClick={onCancel}>Cancel</button>
            </div>
        </header>
    ),
}));
vi.mock('../../components/DashboardTiles/AddTileButton', () => ({
    default: () => <button>Add tile</button>,
}));
vi.mock(
    '../../components/common/Dashboard/DashboardPerformanceWarning',
    () => ({ DashboardPerformanceWarning: () => null }),
);
vi.mock('../../components/common/modal/DashboardUpdateModal', () => ({
    default: () => null,
}));
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: vi.fn() }),
}));

const baseProps = {
    dashboard: { uuid: 'd1', name: 'Weekly revenue review' },
    isEditMode: true,
    hasDashboardChanged: false,
    isSaving: false,
    onSaveDashboard: vi.fn(),
    onCancel: vi.fn(),
} as unknown as ComponentProps<typeof DashboardHeader>;

const renderGuard = (props: Partial<ComponentProps<typeof DashboardHeader>>) =>
    render(
        <MantineProvider>
            <DashboardHeaderGuard {...baseProps} {...props} />
        </MantineProvider>,
    );

const button = (name: string) =>
    screen.getByRole('button', { name, hidden: true });

describe('DashboardHeaderGuard', () => {
    beforeEach(() => {
        mockSidebar.current = { isSidebarOpen: false, isViewer: false };
        mockAccess.userCanManageDashboard = true;
    });

    describe('edit mode band', () => {
        it('draws Editing and the name, then Add tile, Save dashboard, Cancel in order', () => {
            renderGuard({});

            const band = screen.getByTestId('dashboard-edit-band');
            expect(band).toHaveTextContent('Editing');
            expect(band).toHaveTextContent('Weekly revenue review');
            expect(screen.queryByText('Save changes')).toBeNull();

            const names = screen
                .getAllByRole('button')
                .map((b) => b.getAttribute('aria-label') ?? b.textContent);
            expect(names).toEqual([
                'Add tile',
                'Save dashboard',
                'Cancel',
                'Dashboard actions',
            ]);
        });

        it('keeps Save dashboard disabled until there are changes, then saves', async () => {
            const onSaveDashboard = vi.fn();
            const { rerender } = renderGuard({ onSaveDashboard });
            expect(button('Save dashboard')).toBeDisabled();

            rerender(
                <MantineProvider>
                    <DashboardHeaderGuard
                        {...baseProps}
                        onSaveDashboard={onSaveDashboard}
                        hasDashboardChanged
                    />
                </MantineProvider>,
            );
            expect(button('Save dashboard')).toBeEnabled();
            await userEvent.click(button('Save dashboard'));
            expect(onSaveDashboard).toHaveBeenCalledTimes(1);
        });

        it('cancels through the shipped cancel path', async () => {
            const onCancel = vi.fn();
            renderGuard({ onCancel });
            await userEvent.click(button('Cancel'));
            expect(onCancel).toHaveBeenCalledTimes(1);
        });

        it('makes the whole band inert while a filter is edited', () => {
            mockSidebar.current = { isSidebarOpen: true, isViewer: false };
            renderGuard({ hasDashboardChanged: true });

            const band = screen.getByTestId('dashboard-edit-band');
            expect(band.closest('[inert]')).not.toBeNull();
            expect(button('Save dashboard').closest('[inert]')).not.toBeNull();
            expect(button('Cancel').closest('[inert]')).not.toBeNull();
        });

        it('never locks the band while a viewer edits their filters', () => {
            mockSidebar.current = { isSidebarOpen: true, isViewer: true };
            renderGuard({});
            expect(document.querySelector('[inert]')).toBeNull();
        });
    });

    describe('edit mode without manage access', () => {
        it('renders the shipped header, as it does with the flag off', () => {
            mockAccess.userCanManageDashboard = false;
            renderGuard({});

            expect(screen.queryByTestId('dashboard-edit-band')).toBeNull();
            expect(button('Save changes')).toBeInTheDocument();
        });
    });

    describe('view mode', () => {
        it('renders the shipped header, unlocked', () => {
            mockSidebar.current = { isSidebarOpen: true, isViewer: true };
            renderGuard({ isEditMode: false });

            expect(screen.queryByTestId('dashboard-edit-band')).toBeNull();
            expect(button('Save changes')).toBeInTheDocument();
            expect(document.querySelector('[inert]')).toBeNull();
        });
    });
});
