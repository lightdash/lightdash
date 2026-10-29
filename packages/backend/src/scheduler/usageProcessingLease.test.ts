import { SCHEDULER_TASKS } from '@lightdash/common';
import type { JobHelpers } from 'graphile-worker';
import {
    renewUsageProcessingLease,
    USAGE_LEASE_RENEWAL_MS,
    withUsageProcessingLease,
} from './usageProcessingLease';

const fixture = () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const helpers = {
        job: {
            id: '123',
            locked_by: 'worker-one',
            queue_name: 'usage-events-compaction',
            task_identifier: SCHEDULER_TASKS.COMPACT_USAGE_EVENTS,
        },
        withPgClient: async (
            callback: (client: { query: typeof query }) => Promise<unknown>,
        ) => callback({ query }),
    } as unknown as JobHelpers;
    return { query, helpers };
};

describe('usage processing lease', () => {
    afterEach(() => vi.useRealTimers());
    it('renews atomically with bounded SQL and the exact job/worker/queue identity', async () => {
        const { helpers, query } = fixture();
        await renewUsageProcessingLease(helpers);
        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('WITH owned_queue'),
            ['123', 'worker-one', 'usage-events-compaction'],
        );
        expect(query).toHaveBeenCalledWith(
            "SET LOCAL statement_timeout = '10s'",
        );
        expect(query).toHaveBeenLastCalledWith('COMMIT');
    });
    it('rolls back an ownership mismatch and never starts the pipeline', async () => {
        const { helpers, query } = fixture();
        query.mockResolvedValue({ rowCount: 0 });
        const run = vi.fn();
        await expect(withUsageProcessingLease(helpers, run)).rejects.toThrow(
            'lost its job or queue lease',
        );
        expect(run).not.toHaveBeenCalled();
        expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    });
    it.each(['ownership', 'database'])(
        'cancels on %s renewal failure and awaits in-flight work before returning',
        async (failure) => {
            vi.useFakeTimers();
            const { helpers, query } = fixture();
            let signal!: AbortSignal;
            let drain!: () => void;
            const stopped = new Promise<void>((resolve) => {
                drain = resolve;
            });
            const nextWrite = vi.fn();
            const running = withUsageProcessingLease(
                helpers,
                async (current) => {
                    signal = current;
                    await stopped;
                    current.throwIfAborted();
                    nextWrite();
                },
            );
            const outcome = running.catch((error: unknown) => error);
            await vi.advanceTimersByTimeAsync(0);
            if (failure === 'ownership')
                query.mockResolvedValue({ rowCount: 0 });
            else query.mockRejectedValue(new Error('database unavailable'));
            await vi.advanceTimersByTimeAsync(USAGE_LEASE_RENEWAL_MS);
            expect(signal.aborted).toBe(true);
            let returned = false;
            void outcome.then(() => {
                returned = true;
            });
            await Promise.resolve();
            expect(returned).toBe(false);
            drain();
            expect(await outcome).toBeInstanceOf(Error);
            expect(nextWrite).not.toHaveBeenCalled();
            expect(vi.getTimerCount()).toBe(0);
        },
    );
    it('rechecks ownership after the pipeline settles before reporting success', async () => {
        vi.useFakeTimers();
        const { helpers, query } = fixture();
        await expect(
            withUsageProcessingLease(helpers, async () => {
                query.mockResolvedValue({ rowCount: 0 });
                return 'done';
            }),
        ).rejects.toThrow('lost its job or queue lease');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('stops scheduling before a slow final renewal', async () => {
        vi.useFakeTimers();
        const { helpers, query } = fixture();
        let finish!: () => void;
        let checks = 0;
        query.mockImplementation(async (sql: string) => {
            if (sql.includes('WITH owned_queue')) {
                checks += 1;
                if (checks === 2)
                    await new Promise<void>((resolve) => {
                        finish = resolve;
                    });
            }
            return { rowCount: 1 };
        });
        const running = withUsageProcessingLease(helpers, async () => {
            await vi.advanceTimersByTimeAsync(USAGE_LEASE_RENEWAL_MS - 1000);
            return 'done';
        });
        await vi.waitFor(() => expect(checks).toBe(2));
        await vi.advanceTimersByTimeAsync(2000);
        expect(checks).toBe(2);
        finish();
        await expect(running).resolves.toBe('done');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('stops its renewal timer on successful and failed completion', async () => {
        vi.useFakeTimers();
        const { helpers } = fixture();
        await expect(
            withUsageProcessingLease(helpers, async () => 'done'),
        ).resolves.toBe('done');
        await expect(
            withUsageProcessingLease(helpers, async () => {
                throw new Error('pipeline failed');
            }),
        ).rejects.toThrow('pipeline failed');
        expect(vi.getTimerCount()).toBe(0);
    });
});
