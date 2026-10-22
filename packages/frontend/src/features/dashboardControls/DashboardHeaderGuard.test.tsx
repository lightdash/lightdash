import { fireEvent, render, screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type DashboardHeader from '../../components/common/Dashboard/DashboardHeader';
import { DashboardHeaderGuard } from './DashboardHeaderGuard';

const calls = vi.hoisted(() => ({ current: [] as string[] }));
const mockSidebar = vi.hoisted(() => ({
    current: {
        isSidebarOpen: true,
        close: () => calls.current.push('close'),
        discard: () => calls.current.push('discard'),
    },
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
                <div>
                    <button
                        data-dashboard-edit-action
                        onClick={onSaveDashboard}
                    >
                        Save changes
                    </button>
                </div>
                <button data-dashboard-edit-action onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </header>
    ),
}));

const headerProps = {
    onSaveDashboard: () => calls.current.push('save'),
    onCancel: () => calls.current.push('cancel'),
} as unknown as ComponentProps<typeof DashboardHeader>;

describe('DashboardHeaderGuard', () => {
    beforeEach(() => {
        calls.current = [];
        mockSidebar.current = { ...mockSidebar.current, isSidebarOpen: true };
    });

    const isLocked = (name: string) =>
        screen
            .getByRole('button', { name, hidden: true })
            .closest('[inert]') !== null;

    it('locks every header action but Save and Cancel while the editor is open', () => {
        render(<DashboardHeaderGuard {...headerProps} />);

        expect(isLocked('Add tile')).toBe(true);
        expect(screen.getByText('Title').closest('[inert]')).not.toBeNull();
        expect(isLocked('Save changes')).toBe(false);
        expect(isLocked('Cancel')).toBe(false);
    });

    it('unlocks the header once the editor closes', () => {
        const { rerender } = render(<DashboardHeaderGuard {...headerProps} />);
        mockSidebar.current = { ...mockSidebar.current, isSidebarOpen: false };
        rerender(<DashboardHeaderGuard {...headerProps} />);

        expect(document.querySelector('[inert]')).toBeNull();
    });

    it('closes the editor as Done does, then saves', () => {
        render(<DashboardHeaderGuard {...headerProps} />);
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(calls.current).toEqual(['close', 'save']);
    });

    it('drops what the editor wrote, then cancels as shipped', () => {
        render(<DashboardHeaderGuard {...headerProps} />);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(calls.current).toEqual(['discard', 'cancel']);
    });
});
