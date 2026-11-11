import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { ControlsCollapsedStrip, ControlsSummary } from './ControlsStrip';
import type * as ControlCountsModule from './useControlCounts';

const mockEditErgonomics = vi.hoisted(() => ({ current: false }));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: (flag: string) => ({
        data: {
            id: flag,
            enabled:
                flag === 'dashboard-edit-ergonomics' &&
                mockEditErgonomics.current,
        },
    }),
}));
// The real button has its own tests; pin the strip's composition
vi.mock('./DateZoomPills', () => ({
    DefaultZoomButton: () => <button>Default zoom Month</button>,
}));
vi.mock('./useControlCounts', async (importOriginal) => ({
    ...(await importOriginal<typeof ControlCountsModule>()),
    useControlCounts: () => ({ filters: 12, parameters: 0, dateZooms: 1 }),
}));

describe('ControlsCollapsedStrip', () => {
    it('counts each kind present, singular and plural, and omits absent kinds', () => {
        const { container } = renderWithProviders(
            <ControlsCollapsedStrip
                counts={{ filters: 12, parameters: 2, dateZooms: 1 }}
                onExpand={vi.fn()}
            />,
        );
        expect(container).toHaveTextContent(
            '12 filters · 2 parameters · 1 date zoom',
        );

        const { container: single } = renderWithProviders(
            <ControlsCollapsedStrip
                counts={{ filters: 1, parameters: 0, dateZooms: 3 }}
                onExpand={vi.fn()}
            />,
        );
        expect(single).toHaveTextContent(/1 filter · 3 date zooms$/);
        expect(single).not.toHaveTextContent('parameter');
    });
});

describe('ControlsSummary', () => {
    beforeEach(() => {
        mockEditErgonomics.current = false;
    });

    it('leads with a collapsed toggle that expands, and keeps the default zoom', async () => {
        const onExpand = vi.fn();
        renderWithProviders(
            <ControlsSummary isEditMode={false} onExpand={onExpand} />,
        );
        const toggle = screen.getByRole('button', { name: /^Controls/ });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(toggle).toHaveTextContent('Controls13');
        expect(
            screen.getByRole('button', { name: 'Default zoom Month' }),
        ).toBeInTheDocument();
        await userEvent.setup().click(toggle);
        expect(onExpand).toHaveBeenCalledOnce();
    });

    it('keeps the toggle while editing without the floating edit bar', () => {
        renderWithProviders(<ControlsSummary isEditMode onExpand={vi.fn()} />);
        expect(
            screen.getByRole('button', { name: /^Controls/ }),
        ).toHaveAttribute('aria-expanded', 'false');
    });

    it("with the floating edit bar, editing collapses to the default zoom and counts, no toggle (the switch's Hide)", () => {
        mockEditErgonomics.current = true;
        const { container } = renderWithProviders(
            <ControlsSummary isEditMode onExpand={vi.fn()} />,
        );
        expect(
            screen.queryByRole('button', { name: /^Controls/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Default zoom Month' }),
        ).toBeInTheDocument();
        expect(container).toHaveTextContent('12 filters · 1 date zoom');
    });
});
