import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Logger from '../logging/logger';
import { startEventLoopStallDetector } from './eventLoopStallDetector';

describe('event-loop stall detector', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('warns with the current running UUIDs for a stall over one second', () => {
        vi.useFakeTimers();
        const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
        const warn = vi.spyOn(Logger, 'warn');
        const running = new Set(['finished-query']);
        const stop = startEventLoopStallDetector(() => [...running]);
        running.delete('finished-query');
        running.add('running-query');
        clock.mockReturnValue(1501);
        vi.advanceTimersByTime(100);
        expect(warn).toHaveBeenCalledExactlyOnceWith(
            'NATS worker event-loop stall',
            {
                stallMs: 1401,
                runningQueryUuids: ['running-query'],
            },
        );
        stop();
        clock.mockReturnValue(5000);
        vi.advanceTimersByTime(2000);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it.each([1099, 1100])(
        'stays silent at or below the threshold (%s ms elapsed)',
        (elapsed) => {
            vi.useFakeTimers();
            const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
            const warn = vi.spyOn(Logger, 'warn');
            const stop = startEventLoopStallDetector(() => []);
            clock.mockReturnValue(elapsed);
            vi.advanceTimersByTime(100);
            expect(warn).not.toHaveBeenCalled();
            stop();
        },
    );
});
