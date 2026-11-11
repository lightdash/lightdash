import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import {
    ControlsCollapsedStrip,
    ControlsLead,
    ControlsSummary,
} from './ControlsStrip';
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
    DefaultZoomButton: ({ withDivider }: { withDivider: boolean }) => (
        <>
            <button>Default zoom Month</button>
            {withDivider && <hr data-testid="default-zoom-divider" />}
        </>
    ),
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

// As the bar: open and collapsed are different subtrees
const Strip = () => {
    const [isOpen, setIsOpen] = useState(true);
    const counts = { filters: 2, parameters: 0, dateZooms: 0 };
    return isOpen ? (
        <div>
            <ControlsLead
                counts={counts}
                isOpen
                onToggle={() => setIsOpen(false)}
                hasFollowing
            />
        </div>
    ) : (
        <ControlsCollapsedStrip
            counts={counts}
            onExpand={() => setIsOpen(true)}
        />
    );
};

describe('ControlsLead', () => {
    it('draws the divider after the default zoom only when something follows', () => {
        const zero = { filters: 0, parameters: 0, dateZooms: 0 };
        const divider = () => screen.queryByTestId('default-zoom-divider');
        const { unmount } = renderWithProviders(
            <ControlsLead
                counts={zero}
                isOpen
                onToggle={vi.fn()}
                hasFollowing={false}
            />,
        );
        expect(divider()).not.toBeInTheDocument();
        unmount();

        const collapsed = renderWithProviders(
            <ControlsCollapsedStrip counts={zero} onExpand={vi.fn()} />,
        );
        expect(divider()).not.toBeInTheDocument();
        collapsed.unmount();

        renderWithProviders(
            <ControlsCollapsedStrip
                counts={{ ...zero, filters: 1 }}
                onExpand={vi.fn()}
            />,
        );
        expect(divider()).toBeInTheDocument();
    });

    it('keeps focus on the toggle as it collapses and expands the strip', async () => {
        const user = userEvent.setup();
        renderWithProviders(<Strip />);
        const toggle = () => screen.getByRole('button', { name: /^Controls/ });
        await user.tab();
        expect(toggle()).toHaveFocus();
        await user.keyboard('{Enter}');
        expect(toggle()).toHaveAttribute('aria-expanded', 'false');
        await waitFor(() => expect(toggle()).toHaveFocus());
        await user.keyboard('{Enter}');
        expect(toggle()).toHaveAttribute('aria-expanded', 'true');
        await waitFor(() => expect(toggle()).toHaveFocus());
    });

    it('restores focus to its own toggle with two strips on the page', async () => {
        const user = userEvent.setup();
        renderWithProviders(
            <>
                <section aria-label="first">
                    <Strip />
                </section>
                <section aria-label="second">
                    <Strip />
                </section>
            </>,
        );
        const toggle = (name: string) =>
            within(screen.getByRole('region', { name })).getByRole('button', {
                name: /^Controls/,
            });
        await user.click(toggle('second'));
        expect(toggle('second')).toHaveAttribute('aria-expanded', 'false');
        await waitFor(() => expect(toggle('second')).toHaveFocus());
        await user.click(toggle('second'));
        await waitFor(() => expect(toggle('second')).toHaveFocus());
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
