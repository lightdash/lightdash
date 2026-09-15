import { useMatches } from '@mantine/core';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import ResizableSplitter from '../../../../components/common/ResizableSplitter';
import { mockViewport } from '../../../../testing/mockViewport';
import { renderWithProviders } from '../../../../testing/testUtils';
import { CanvasSidebar } from './CanvasSidebar';

const DraftCanvas = () => {
    const [draft, setDraft] = useState('');
    return (
        <input
            aria-label="Canvas draft"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
        />
    );
};

const CanvasWithSidebar = () => {
    const [opened, setOpened] = useState(false);
    const compact = useMatches(
        { base: true, sm: false },
        { getInitialValueInEffect: false },
    );
    return (
        <>
            <button onClick={() => setOpened(true)}>Open trees</button>
            <ResizableSplitter
                orientation="horizontal"
                sizes={compact ? [0, 100] : undefined}
                resizable={!compact}
            >
                <ResizableSplitter.Pane
                    id="trees"
                    defaultSize={20}
                    min={compact ? 0 : 15}
                    max={40}
                >
                    <CanvasSidebar
                        compact={compact}
                        title="Saved trees"
                        opened={opened}
                        onClose={() => setOpened(false)}
                    >
                        <button onClick={() => setOpened(false)}>
                            Revenue tree
                        </button>
                    </CanvasSidebar>
                </ResizableSplitter.Pane>
                <ResizableSplitter.Pane id="canvas" defaultSize={80}>
                    <DraftCanvas />
                </ResizableSplitter.Pane>
            </ResizableSplitter>
        </>
    );
};

describe('responsive canvas sidebar', () => {
    it('uses the layout owner decision even when the viewport is wide', () => {
        const viewport = mockViewport(1280);
        const { unmount } = renderWithProviders(
            <CanvasSidebar
                compact
                title="Saved trees"
                opened
                onClose={() => {}}
            >
                Tree content
            </CanvasSidebar>,
        );
        try {
            expect(
                screen.getByRole('dialog', { name: 'Saved trees' }),
            ).toBeVisible();
        } finally {
            unmount();
            viewport.restore();
        }
    });

    it('preserves state inside the sidebar across resize', () => {
        const viewport = mockViewport(1024);
        const { unmount, rerender } = renderWithProviders(
            <CanvasSidebar
                compact={false}
                title="Saved trees"
                opened
                onClose={() => {}}
            >
                <DraftCanvas />
            </CanvasSidebar>,
        );
        try {
            const input = screen.getByRole('textbox', { name: 'Canvas draft' });
            fireEvent.change(input, { target: { value: 'Unsaved selection' } });
            viewport.resize(744);
            rerender(
                <CanvasSidebar
                    compact
                    title="Saved trees"
                    opened
                    onClose={() => {}}
                >
                    <DraftCanvas />
                </CanvasSidebar>,
            );
            expect(screen.getByRole('textbox', { name: 'Canvas draft' })).toBe(
                input,
            );
            expect(input).toHaveValue('Unsaved selection');
            viewport.resize(1024);
            rerender(
                <CanvasSidebar
                    compact={false}
                    title="Saved trees"
                    opened
                    onClose={() => {}}
                >
                    <DraftCanvas />
                </CanvasSidebar>,
            );
            expect(screen.getByRole('textbox', { name: 'Canvas draft' })).toBe(
                input,
            );
            expect(input).toHaveValue('Unsaved selection');
        } finally {
            unmount();
            viewport.restore();
        }
    });

    it('opens and closes a compact drawer without remounting the sibling canvas', async () => {
        const viewport = mockViewport(1024);
        try {
            const user = userEvent.setup();
            renderWithProviders(<CanvasWithSidebar />);
            const draft = screen.getByRole('textbox', { name: 'Canvas draft' });
            fireEvent.change(draft, {
                target: { value: 'Unsaved revenue tree' },
            });
            expect(draft).toHaveValue('Unsaved revenue tree');
            expect(
                screen.getByRole('button', { name: 'Revenue tree' }),
            ).toBeVisible();

            viewport.resize(744);
            expect(
                screen.queryByRole('button', { name: 'Revenue tree' }),
            ).not.toBeInTheDocument();
            await user.click(
                screen.getByRole('button', { name: 'Open trees' }),
            );
            expect(
                screen.getByRole('dialog', { name: 'Saved trees' }),
            ).toBeVisible();
            await user.click(
                screen.getByRole('button', { name: 'Close Saved trees' }),
            );
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(screen.getByRole('textbox', { name: 'Canvas draft' })).toBe(
                draft,
            );
            expect(draft).toHaveValue('Unsaved revenue tree');

            viewport.resize(1024);
            expect(
                screen.getByRole('button', { name: 'Revenue tree' }),
            ).toBeVisible();
            expect(screen.getByRole('textbox', { name: 'Canvas draft' })).toBe(
                draft,
            );
            expect(draft).toHaveValue('Unsaved revenue tree');
        } finally {
            viewport.restore();
        }
    });
});
