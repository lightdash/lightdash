import {
    MIGRATION_HEARTBEAT_INTERVAL_MS,
    MigrationHeartbeat,
    MigrationLeaseLostError,
} from './heartbeat';

afterEach(() => {
    vi.useRealTimers();
});

describe('MigrationHeartbeat', () => {
    test('renews for more than 40 minutes without becoming stale', async () => {
        vi.useFakeTimers();
        const heartbeat = vi.fn(async () => true);
        const scheduler = new MigrationHeartbeat({
            leaseManager: { heartbeat },
            token: 'claim-a',
        });

        scheduler.start();
        await vi.advanceTimersByTimeAsync(40 * 60_000 + 10_000);

        expect(heartbeat).toHaveBeenCalledTimes(241);
        expect(() => scheduler.assertHeld()).not.toThrow();
        await scheduler.stop();
    });

    test('latches a token-mismatched heartbeat as lease loss', async () => {
        vi.useFakeTimers();
        const heartbeat = vi.fn(async () => false);
        const onLeaseLost = vi.fn();
        const scheduler = new MigrationHeartbeat({
            leaseManager: { heartbeat },
            token: 'stale-token',
            onLeaseLost,
        });

        scheduler.start();
        await vi.advanceTimersByTimeAsync(MIGRATION_HEARTBEAT_INTERVAL_MS);

        expect(() => scheduler.assertHeld()).toThrow(MigrationLeaseLostError);
        await vi.advanceTimersByTimeAsync(MIGRATION_HEARTBEAT_INTERVAL_MS * 2);
        expect(heartbeat).toHaveBeenCalledTimes(1);
        expect(onLeaseLost).toHaveBeenCalledExactlyOnceWith(
            expect.any(MigrationLeaseLostError),
        );
        await scheduler.stop();
    });

    test('latches lease loss when heartbeat errors span the expiry window', async () => {
        vi.useFakeTimers();
        let now = 0;
        const onLeaseLost = vi.fn();
        const heartbeat = vi.fn(async () => {
            throw new Error('database unavailable');
        });
        const scheduler = new MigrationHeartbeat({
            leaseManager: { heartbeat },
            token: 'claim-a',
            intervalMs: 10,
            expiryMs: 25,
            now: () => now,
            onLeaseLost,
        });

        scheduler.start();
        now = 10;
        await vi.advanceTimersByTimeAsync(10);
        expect(() => scheduler.assertHeld()).not.toThrow();
        now = 20;
        await vi.advanceTimersByTimeAsync(10);
        expect(() => scheduler.assertHeld()).not.toThrow();
        now = 30;
        await vi.advanceTimersByTimeAsync(10);
        expect(() => scheduler.assertHeld()).toThrow(
            'Migration lease heartbeat could not be renewed before expiry',
        );
        await vi.advanceTimersByTimeAsync(100);
        expect(onLeaseLost).toHaveBeenCalledOnce();
        await scheduler.stop();
    });

    test('a successful retry resets the heartbeat error window', async () => {
        vi.useFakeTimers();
        let now = 0;
        const heartbeat = vi
            .fn<() => Promise<boolean>>()
            .mockRejectedValueOnce(new Error('database unavailable'))
            .mockResolvedValueOnce(true)
            .mockRejectedValue(new Error('database unavailable'));
        const scheduler = new MigrationHeartbeat({
            leaseManager: { heartbeat },
            token: 'claim-a',
            intervalMs: 10,
            expiryMs: 25,
            now: () => now,
        });

        scheduler.start();
        now = 10;
        await vi.advanceTimersByTimeAsync(10);
        now = 20;
        await vi.advanceTimersByTimeAsync(10);
        now = 40;
        await vi.advanceTimersByTimeAsync(10);
        expect(() => scheduler.assertHeld()).not.toThrow();
        now = 50;
        await vi.advanceTimersByTimeAsync(10);
        expect(() => scheduler.assertHeld()).toThrow(MigrationLeaseLostError);
        await scheduler.stop();
    });
});
