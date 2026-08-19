import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useElapsedClock } from './useElapsedClock';

const START = '2026-01-01T00:00:00.000Z';

describe('useElapsedClock', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(START));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('counts up from the start', () => {
        const { result } = renderHook(() => useElapsedClock(new Date(START)));

        expect(result.current).toBe('0:00');
        act(() => {
            vi.advanceTimersByTime(12_000);
        });
        expect(result.current).toBe('0:12');
    });

    it('reports nothing when nothing is running', () => {
        const { result } = renderHook(() => useElapsedClock(null));

        expect(result.current).toBeNull();
    });

    // A caller that derives the start from server data builds a fresh Date on
    // every render. Keying the timer on the object identity restarted it each
    // time, and the state it set re-rendered the caller — an endless loop.
    it('keeps one timer when the caller passes an equal but new Date', () => {
        const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
        const { rerender, result } = renderHook(
            ({ at }: { at: Date }) => useElapsedClock(at),
            { initialProps: { at: new Date(START) } },
        );

        expect(setIntervalSpy).toHaveBeenCalledTimes(1);

        rerender({ at: new Date(START) });
        rerender({ at: new Date(START) });

        expect(setIntervalSpy).toHaveBeenCalledTimes(1);
        expect(result.current).toBe('0:00');
    });

    it('restarts when the build genuinely restarts', () => {
        const { rerender, result } = renderHook(
            ({ at }: { at: Date }) => useElapsedClock(at),
            { initialProps: { at: new Date(START) } },
        );

        act(() => {
            vi.advanceTimersByTime(30_000);
        });
        expect(result.current).toBe('0:30');

        rerender({ at: new Date('2026-01-01T00:00:30.000Z') });
        expect(result.current).toBe('0:00');
    });
});
