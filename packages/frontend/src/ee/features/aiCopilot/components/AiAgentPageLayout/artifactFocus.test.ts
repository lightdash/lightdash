import { act, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useArtifactFocusMode } from './artifactFocus';

const chart = { id: 'chart' };
const app = { id: 'app' };

describe('useArtifactFocusMode', () => {
    it('toggles focus for the open preview', () => {
        const { result } = renderHook(() => useArtifactFocusMode(chart));
        expect(result.current.isFocused).toBe(false);

        act(() => result.current.toggle());
        expect(result.current.isFocused).toBe(true);

        act(() => result.current.toggle());
        expect(result.current.isFocused).toBe(false);
    });

    it('exits on Escape unless something else handled it', () => {
        const { result } = renderHook(() => useArtifactFocusMode(chart));
        act(() => result.current.toggle());

        const handled = new KeyboardEvent('keydown', {
            key: 'Escape',
            cancelable: true,
        });
        handled.preventDefault();
        act(() => {
            window.dispatchEvent(handled);
        });
        expect(result.current.isFocused).toBe(true);

        act(() => {
            fireEvent.keyDown(window, { key: 'Escape' });
        });
        expect(result.current.isFocused).toBe(false);
    });

    it('resets when the preview changes or closes', () => {
        const { result, rerender } = renderHook(
            ({ preview }: { preview: object | null }) =>
                useArtifactFocusMode(preview),
            { initialProps: { preview: chart as object | null } },
        );
        act(() => result.current.toggle());
        expect(result.current.isFocused).toBe(true);

        rerender({ preview: app });
        expect(result.current.isFocused).toBe(false);

        rerender({ preview: null });
        rerender({ preview: app });
        expect(result.current.isFocused).toBe(false);
    });
});
