import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFileDropTarget } from './useFileDropTarget';

// jsdom has no DataTransfer/DragEvent; a plain event with the fields the
// hook reads is enough.
const dragEvent = (type: string, types: string[], files: File[] = []) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
        value: { types, files, dropEffect: 'none' },
    });
    return event;
};
const fileDragEvent = (type: string, files: File[] = []) =>
    dragEvent(type, ['Files'], files);
const textDragEvent = (type: string) => dragEvent(type, ['text/plain']);

describe('useFileDropTarget', () => {
    it('reports a file drag anywhere over the window and clears on leave', () => {
        const { result } = renderHook(() =>
            useFileDropTarget({ enabled: true, onDropFiles: vi.fn() }),
        );
        expect(result.current.isDraggingFiles).toBe(false);

        act(() => {
            window.dispatchEvent(fileDragEvent('dragenter'));
            window.dispatchEvent(fileDragEvent('dragenter'));
        });
        expect(result.current.isDraggingFiles).toBe(true);

        act(() => {
            window.dispatchEvent(fileDragEvent('dragleave'));
        });
        expect(result.current.isDraggingFiles).toBe(true);

        act(() => {
            window.dispatchEvent(fileDragEvent('dragleave'));
        });
        expect(result.current.isDraggingFiles).toBe(false);
    });

    it('ignores drags that carry no files', () => {
        const { result } = renderHook(() =>
            useFileDropTarget({ enabled: true, onDropFiles: vi.fn() }),
        );
        act(() => {
            window.dispatchEvent(textDragEvent('dragenter'));
        });
        expect(result.current.isDraggingFiles).toBe(false);
    });

    it('hands dropped files to the callback and resets', () => {
        const onDropFiles = vi.fn();
        const { result } = renderHook(() =>
            useFileDropTarget({ enabled: true, onDropFiles }),
        );
        const file = new File(['hello'], 'notes.md', { type: 'text/markdown' });
        act(() => {
            window.dispatchEvent(fileDragEvent('dragenter'));
        });
        act(() => {
            const event = fileDragEvent('drop', [file]);
            result.current.dropTargetProps.onDrop(
                event as unknown as React.DragEvent<HTMLElement>,
            );
        });
        expect(onDropFiles).toHaveBeenCalledWith([file]);
        expect(result.current.isDraggingFiles).toBe(false);
    });

    it('does nothing while disabled', () => {
        const onDropFiles = vi.fn();
        const { result } = renderHook(() =>
            useFileDropTarget({ enabled: false, onDropFiles }),
        );
        act(() => {
            window.dispatchEvent(fileDragEvent('dragenter'));
        });
        expect(result.current.isDraggingFiles).toBe(false);
    });
});
