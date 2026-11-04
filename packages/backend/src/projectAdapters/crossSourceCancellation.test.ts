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

it.each(['prepare', 'ls', 'resolution'] as const)(
    'keeps the %s timeout setting in logs and out of the user message',
    async (phase) => {
        vi.useFakeTimers();
        const warn = vi.spyOn(Logger, 'warn').mockReturnValue(Logger);
        const cancellation = new CrossSourceCancellation(undefined, {
            prepareMs: phase === 'prepare' ? 10 : 100,
            lsMs: phase === 'ls' ? 10 : 100,
            resolutionMs: phase === 'resolution' ? 10 : 100,
        });
        try {
            const work = cancellation
                .run(
                    'leaf_c',
                    phase === 'prepare' ? 'prepare' : 'ls',
                    async (signal) =>
                        new Promise<never>((_resolve, reject) => {
                            signal.addEventListener(
                                'abort',
                                () => reject(signal.reason),
                                { once: true },
                            );
                        }),
                )
                .catch((error: unknown) => error);
            await vi.advanceTimersByTimeAsync(10);
            const error = await work;
            expect(error).toHaveProperty(
                'message',
                expect.stringContaining('timed out after 0.01 s'),
            );
            expect((error as Error).message).not.toMatch(/DBT_|Raise /);
            expect(warn).toHaveBeenCalledWith(
                'dbt.compile.crossSourceTimeout',
                expect.objectContaining({
                    phase,
                    setting: {
                        prepare: 'DBT_SOURCE_PREPARE_TIMEOUT_MS',
                        ls: 'DBT_SOURCE_LS_TIMEOUT_MS',
                        resolution: 'DBT_CROSS_SOURCE_RESOLUTION_TIMEOUT_MS',
                    }[phase],
                }),
            );
        } finally {
            cancellation.dispose();
            vi.useRealTimers();
            vi.restoreAllMocks();
        }
    },
);
