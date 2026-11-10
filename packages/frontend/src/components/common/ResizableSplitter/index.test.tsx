import { MantineProvider } from '@mantine/core';
import { type UseSplitterReturnValue } from '@mantine/hooks';
import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { createRef, useLayoutEffect, useRef, type RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ResizableSplitter from './index';

const Layout = ({
    open = true,
    storageKey,
    resizable = true,
}: {
    open?: boolean;
    storageKey?: string;
    resizable?: boolean;
}) => (
    <MantineProvider>
        <ResizableSplitter storageKey={storageKey} resizable={resizable}>
            <ResizableSplitter.Pane id="editor" defaultSize={60} min={20}>
                <input aria-label="Editor content" />
            </ResizableSplitter.Pane>
            {open && (
                <ResizableSplitter.Pane
                    id="reference"
                    defaultSize={40}
                    min={20}
                >
                    Reference
                </ResizableSplitter.Pane>
            )}
        </ResizableSplitter>
    </MantineProvider>
);

const PreviewLayout = ({
    preview,
    splitterRef,
}: {
    preview: boolean;
    splitterRef?: RefObject<UseSplitterReturnValue | null>;
}) => (
    <MantineProvider>
        <ResizableSplitter splitterRef={splitterRef}>
            <ResizableSplitter.Pane id="sidebar" defaultSize={40} collapsible>
                Sidebar
            </ResizableSplitter.Pane>
            <ResizableSplitter.Pane id="chat" defaultSize={40}>
                Chat
            </ResizableSplitter.Pane>
            {preview && (
                <ResizableSplitter.Pane id="preview" defaultSize={20}>
                    Preview
                </ResizableSplitter.Pane>
            )}
        </ResizableSplitter>
    </MantineProvider>
);

const separator = () =>
    screen.getByRole('separator', { name: 'Resize panels' });

describe('ResizableSplitter', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('restores resized layouts after conditional panes close and reopen without remounting editor content', () => {
        const { rerender } = render(<Layout />);
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'unsaved SQL' },
        });
        fireEvent.keyDown(separator(), { key: 'ArrowRight', shiftKey: true });
        expect(separator()).toHaveAttribute('aria-valuenow', '70');
        rerender(<Layout open={false} />);
        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
        expect(screen.getByRole('textbox').parentElement).toHaveStyle({
            flexBasis: '100%',
        });
        rerender(<Layout />);
        expect(separator()).toHaveAttribute('aria-valuenow', '70');
        expect(screen.getByRole('textbox')).toHaveValue('unsaved SQL');
    });

    it('persists keyboard resizing and restores it on mount', async () => {
        const { unmount } = render(<Layout storageKey="test" />);
        fireEvent.keyDown(separator(), { key: 'ArrowLeft', shiftKey: true });
        await waitFor(() =>
            expect(localStorage.getItem('lightdash-splitter:test')).toContain(
                '[50,50]',
            ),
        );
        unmount();
        render(<Layout storageKey="test" />);
        expect(separator()).toHaveAttribute('aria-valuenow', '50');
    });

    it('migrates existing saved layouts', () => {
        localStorage.setItem(
            'react-resizable-panels:test',
            JSON.stringify({
                'editor,reference': { layout: [65, 35], expandToSizes: {} },
            }),
        );
        render(<Layout storageKey="test" />);
        expect(separator()).toHaveAttribute('aria-valuenow', '65');
    });

    it.each([
        '{broken',
        '{"editor,reference":[-10,110]}',
        '{"editor,reference":[30]}',
    ])('ignores unusable saved layouts: %s', (saved) => {
        localStorage.setItem('lightdash-splitter:test', saved);
        render(<Layout storageKey="test" />);
        expect(separator()).toHaveAttribute('aria-valuenow', '60');
    });

    it('blocks keyboard resizing while the handle is disabled', () => {
        render(<Layout resizable={false} />);
        fireEvent.keyDown(separator(), { key: 'ArrowRight', shiftKey: true });
        expect(separator()).toHaveAttribute('aria-valuenow', '60');
        expect(separator()).toHaveAttribute('aria-disabled', 'true');
    });

    it('applies pointer drags made after a pane opens', () => {
        vi.stubGlobal('PointerEvent', MouseEvent);
        vi.spyOn(
            HTMLElement.prototype,
            'getBoundingClientRect',
        ).mockReturnValue(new DOMRect(0, 0, 1000, 500));
        const { rerender } = render(<PreviewLayout preview={false} />);
        rerender(<PreviewLayout preview />);

        const handle = screen.getAllByRole('separator')[0];
        handle.setPointerCapture = vi.fn();
        fireEvent.pointerDown(handle, { button: 0, clientX: 400 });
        fireEvent.pointerUp(document, { clientX: 500 });

        expect(handle).toHaveAttribute('aria-valuenow', '50');
    });

    it('applies a collapse made from a parent layout effect when panes change', () => {
        const CollapsesOnPreview = ({ preview }: { preview: boolean }) => {
            const splitterRef = useRef<UseSplitterReturnValue>(null);
            useLayoutEffect(() => {
                if (preview) splitterRef.current?.collapse(0);
            }, [preview]);
            return (
                <PreviewLayout preview={preview} splitterRef={splitterRef} />
            );
        };
        const { rerender } = render(<CollapsesOnPreview preview={false} />);
        rerender(<CollapsesOnPreview preview />);

        expect(screen.getAllByRole('separator')[0]).toHaveAttribute(
            'aria-valuenow',
            '0',
        );
    });

    it('restores the previous size after imperative collapse and expand', () => {
        const splitterRef = createRef<UseSplitterReturnValue>();
        render(
            <MantineProvider>
                <ResizableSplitter splitterRef={splitterRef}>
                    <ResizableSplitter.Pane
                        id="sidebar"
                        defaultSize={30}
                        min={10}
                        collapsible
                    >
                        Sidebar
                    </ResizableSplitter.Pane>
                    <ResizableSplitter.Pane id="content" defaultSize={70}>
                        Content
                    </ResizableSplitter.Pane>
                </ResizableSplitter>
            </MantineProvider>,
        );
        fireEvent.keyDown(separator(), { key: 'ArrowRight', shiftKey: true });
        act(() => splitterRef.current?.collapse(0));
        expect(separator()).toHaveAttribute('aria-valuenow', '0');
        act(() => splitterRef.current?.expand(0));
        expect(separator()).toHaveAttribute('aria-valuenow', '40');
    });
});
