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

const headerProps = {
    onSaveDashboard: vi.fn(),
    onCancel: vi.fn(),
} as unknown as ComponentProps<typeof DashboardHeader>;

describe('DashboardHeaderGuard', () => {
    beforeEach(() => {
        mockSidebar.current = { isSidebarOpen: true, isViewer: false };
    });

    const isLocked = (name: string) =>
        screen
            .getByRole('button', { name, hidden: true })
            .closest('[inert]') !== null;

    it('locks the whole header, Save and Cancel included, while a filter is edited', () => {
        render(<DashboardHeaderGuard {...headerProps} />);

        expect(isLocked('Add tile')).toBe(true);
        expect(screen.getByText('Title').closest('[inert]')).not.toBeNull();
        expect(isLocked('Save changes')).toBe(true);
        expect(isLocked('Cancel')).toBe(true);
    });

    it('unlocks the header once the editor closes', () => {
        const { rerender } = render(<DashboardHeaderGuard {...headerProps} />);
        mockSidebar.current = { ...mockSidebar.current, isSidebarOpen: false };
        rerender(<DashboardHeaderGuard {...headerProps} />);

        expect(document.querySelector('[inert]')).toBeNull();
    });

    it('never locks the header while a viewer edits their filters', () => {
        mockSidebar.current = { ...mockSidebar.current, isViewer: true };
        render(<DashboardHeaderGuard {...headerProps} />);
        expect(document.querySelector('[inert]')).toBeNull();
    });
});
