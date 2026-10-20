import Logger from '../logging/logger';
import {
    CROSS_SOURCE_SETTLE_GRACE_MS,
    CrossSourceCancellation,
    DEFAULT_CROSS_SOURCE_TIMEOUTS,
} from './crossSourceCancellation';

it('bounds settlement and logs the sources whose operations never exit', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(Logger, 'warn').mockReturnValue(Logger);
    const cancellation = new CrossSourceCancellation(
        undefined,
        DEFAULT_CROSS_SOURCE_TIMEOUTS,
    );
    const work = cancellation
        .run('leaf_a', 'prepare', async () => new Promise<never>(() => {}))
        .catch((error: unknown) => error);
    const reason = new Error('leaf_b');
    try {
        await vi.advanceTimersByTimeAsync(0);
        const failure = cancellation
            .fail(reason)
            .catch((error: unknown) => error);
        let settled = false;
        void failure.then(() => {
            settled = true;
        });
        await vi.advanceTimersByTimeAsync(CROSS_SOURCE_SETTLE_GRACE_MS - 1);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await failure).toBe(reason);
        expect(await work).toBe(reason);
        expect(warn).toHaveBeenCalledExactlyOnceWith(
            'dbt.compile.crossSourceSettleTimeout',
            {
                event: 'dbt.compile.crossSourceSettleTimeout',
                sources: ['leaf_a'],
            },
        );
    } finally {
        cancellation.dispose();
        vi.useRealTimers();
        vi.restoreAllMocks();
    }
});
