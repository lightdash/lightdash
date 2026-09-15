import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Panel, PanelGroup } from 'react-resizable-panels';
import { describe, expect, it, vi } from 'vitest';
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
    return (
        <>
            <button onClick={() => setOpened(true)}>Open trees</button>
            <PanelGroup direction="horizontal">
                <CanvasSidebar
                    id="trees"
                    title="Saved trees"
                    opened={opened}
                    onClose={() => setOpened(false)}
                >
                    <button onClick={() => setOpened(false)}>
                        Revenue tree
                    </button>
                </CanvasSidebar>
                <Panel id="canvas" order={2} defaultSize={80}>
                    <DraftCanvas />
                </Panel>
            </PanelGroup>
        </>
    );
};

describe('responsive canvas sidebar', () => {
    it('opens and closes a compact drawer without remounting the sibling canvas', async () => {
        let compact = false;
        const listeners = new Set<(event: MediaQueryListEvent) => void>();
        const defaultMediaQuery = {
            matches: false,
            media: '',
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        };
        const mock = vi
            .spyOn(window, 'matchMedia')
            .mockImplementation((query) => {
                if (!query.startsWith('(width <'))
                    return { ...defaultMediaQuery, media: query };
                return {
                    ...defaultMediaQuery,
                    media: query,
                    get matches() {
                        return compact;
                    },
                    addEventListener: (
                        _name: string,
                        callback: (event: MediaQueryListEvent) => void,
                    ) => listeners.add(callback),
                    removeEventListener: (
                        _name: string,
                        callback: (event: MediaQueryListEvent) => void,
                    ) => listeners.delete(callback),
                } as MediaQueryList;
            });
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

            act(() => {
                compact = true;
                listeners.forEach((listener) =>
                    listener({ matches: true } as MediaQueryListEvent),
                );
            });
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

            act(() => {
                compact = false;
                listeners.forEach((listener) =>
                    listener({ matches: false } as MediaQueryListEvent),
                );
            });
            expect(
                screen.getByRole('button', { name: 'Revenue tree' }),
            ).toBeVisible();
            expect(screen.getByRole('textbox', { name: 'Canvas draft' })).toBe(
                draft,
            );
            expect(draft).toHaveValue('Unsaved revenue tree');
        } finally {
            mock.mockRestore();
        }
    });
});
