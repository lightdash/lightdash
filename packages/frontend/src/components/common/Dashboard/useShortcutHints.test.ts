import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShortcutHints } from './useShortcutHints';

const areHintsShown = () => 'shortcutHints' in document.body.dataset;

const holdModifier = () => {
    window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Meta', metaKey: true }),
    );
    vi.advanceTimersByTime(200);
};

describe('useShortcutHints', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows the hints while the modifier is held and clears them on release', () => {
        renderHook(() => useShortcutHints(true));
        holdModifier();
        expect(areHintsShown()).toBe(true);

        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
        expect(areHintsShown()).toBe(false);
    });

    it('keeps the hints while the pointer moves with the modifier still held', () => {
        renderHook(() => useShortcutHints(true));
        holdModifier();

        window.dispatchEvent(new MouseEvent('mousemove', { metaKey: true }));
        expect(areHintsShown()).toBe(true);
    });

    it('clears the hints when the release was never seen and the pointer moves with no modifier held', () => {
        renderHook(() => useShortcutHints(true));
        holdModifier();

        window.dispatchEvent(new MouseEvent('mousemove'));
        expect(areHintsShown()).toBe(false);
    });
});
