import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExpiryTimer } from './useExpiryTimer';

describe('useExpiryTimer', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('clamps long delays and reschedules until expiry', () => {
        const maxDelay = 2 ** 31 - 1;
        const expiresAt = Date.now() + maxDelay + 1000;
        let renders = 0;
        renderHook(() => {
            useExpiryTimer(expiresAt);
            renders += 1;
        });
        act(() => {
            vi.advanceTimersByTime(maxDelay - 1);
        });
        expect(renders).toBe(1);
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(renders).toBe(2);
        expect(vi.getTimerCount()).toBe(1);
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(renders).toBe(3);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('clears the old timer on a change and the current timer on unmount', () => {
        let renders = 0;
        const { rerender, unmount } = renderHook(
            ({ expiresAt }) => {
                useExpiryTimer(expiresAt);
                renders += 1;
            },
            { initialProps: { expiresAt: Date.now() + 1000 } },
        );
        rerender({ expiresAt: Date.now() + 2000 });
        expect(vi.getTimerCount()).toBe(1);
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(renders).toBe(2);
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(renders).toBe(3);
        rerender({ expiresAt: Date.now() + 1000 });
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each([null, Date.now() - 1])(
        'does not schedule absent or expired credentials: %s',
        (expiresAt) => {
            renderHook(() => useExpiryTimer(expiresAt));
            expect(vi.getTimerCount()).toBe(0);
        },
    );
});
