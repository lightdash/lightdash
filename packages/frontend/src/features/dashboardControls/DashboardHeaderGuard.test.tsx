import { fireEvent, render, screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type DashboardHeader from '../../components/common/Dashboard/DashboardHeader';
import { DashboardHeaderGuard } from './DashboardHeaderGuard';

const calls = vi.hoisted(() => ({ current: [] as string[] }));
const mockSidebar = vi.hoisted(() => ({
    current: {
        close: () => calls.current.push('close'),
        discard: () => calls.current.push('discard'),
    },
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: typeof mockSidebar.current) => unknown,
    ) => selector(mockSidebar.current),
}));
// The shipped header, down to the two buttons this guard is about
vi.mock('../../components/common/Dashboard/DashboardHeader', () => ({
    default: ({
        onSaveDashboard,
        onCancel,
    }: ComponentProps<typeof DashboardHeader>) => (
        <>
            <button onClick={onSaveDashboard}>Save changes</button>
            <button onClick={onCancel}>Cancel</button>
        </>
    ),
}));

const headerProps = {
    onSaveDashboard: () => calls.current.push('save'),
    onCancel: () => calls.current.push('cancel'),
} as unknown as ComponentProps<typeof DashboardHeader>;

describe('DashboardHeaderGuard', () => {
    beforeEach(() => {
        calls.current = [];
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
