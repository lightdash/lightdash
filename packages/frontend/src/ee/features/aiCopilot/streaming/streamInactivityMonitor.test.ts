import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStreamInactivityMonitor } from './streamInactivityMonitor';

describe('createStreamInactivityMonitor', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('reports an inactive stream after the timeout', () => {
        vi.useFakeTimers();
        const onInactive = vi.fn();

        createStreamInactivityMonitor({ onInactive, timeoutMs: 1_000 });

        vi.advanceTimersByTime(999);
        expect(onInactive).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onInactive).toHaveBeenCalledOnce();
    });

    it('restarts the timeout when a chunk arrives', () => {
        vi.useFakeTimers();
        const onInactive = vi.fn();
        const monitor = createStreamInactivityMonitor({
            onInactive,
            timeoutMs: 1_000,
        });

        vi.advanceTimersByTime(900);
        monitor.reset();
        vi.advanceTimersByTime(999);
        expect(onInactive).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onInactive).toHaveBeenCalledOnce();
    });

    it('stops watching the stream', () => {
        vi.useFakeTimers();
        const onInactive = vi.fn();
        const monitor = createStreamInactivityMonitor({
            onInactive,
            timeoutMs: 1_000,
        });

        monitor.stop();
        vi.advanceTimersByTime(1_000);

        expect(onInactive).not.toHaveBeenCalled();
    });
});
