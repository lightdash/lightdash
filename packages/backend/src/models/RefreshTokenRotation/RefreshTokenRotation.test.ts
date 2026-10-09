import { UnexpectedServerError } from '@lightdash/common';
import { type Knex } from 'knex';
import { DatabaseError } from 'pg';
import {
    RefreshTokenLockTimeoutError,
    RefreshTokenRotation,
    RefreshTokenRowMissingError,
    type RefreshRun,
} from './RefreshTokenRotation';

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

const createDatabase = () => {
    const raw = vi.fn().mockResolvedValue(undefined);
    const transaction = vi.fn(
        async (callback: (trx: Knex.Transaction) => unknown) =>
            callback({ raw } as unknown as Knex.Transaction),
    );
    return { database: { transaction } as unknown as Knex, transaction, raw };
};

const createRun = (uuid = 'row-1') => ({
    key: { kind: 'project' as const, uuid, purpose: null },
    shareKey: 'provider-client-fingerprint',
    readCurrentRefreshToken: vi
        .fn<RefreshRun<{ token: string }>['readCurrentRefreshToken']>()
        .mockResolvedValue('current-token'),
    exchange: vi
        .fn<RefreshRun<{ token: string }>['exchange']>()
        .mockResolvedValue({ token: 'access-token' }),
    persist: vi
        .fn<RefreshRun<{ token: string }>['persist']>()
        .mockResolvedValue(undefined),
});

const startedRun = (uuid = 'row-1') => {
    const started = deferred<void>();
    const exchanged = deferred<{ token: string }>();
    const run = createRun(uuid);
    run.exchange.mockImplementation(() => {
        started.resolve();
        return exchanged.promise;
    });
    return { run, started: started.promise, exchanged };
};

describe('RefreshTokenRotation', () => {
    afterEach(() => vi.useRealTimers());

    test('shares one exchange and write across coordinator instances until persistence finishes', async () => {
        const { database, raw, transaction } = createDatabase();
        const leader = new RefreshTokenRotation({ database });
        const follower = new RefreshTokenRotation({ database });
        const { run, started, exchanged } = startedRun();
        const persisted = deferred<void>();
        const persisting = deferred<void>();
        run.persist.mockImplementation(() => {
            persisting.resolve();
            return persisted.promise;
        });
        const first = leader.run(run);
        await started;
        const followerRun = createRun();
        const second = follower.run(followerRun);
        const result = { token: 'new-access-token' };
        exchanged.resolve(result);
        await persisting.promise;
        const third = follower.run(followerRun);
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(raw.mock.calls).toEqual([
            ["SET LOCAL lock_timeout = '5s'"],
            [
                'select pg_advisory_xact_lock(hashtextextended(?, 0))',
                ['oauth-refresh:project:row-1:'],
            ],
        ]);
        expect(run.persist).toHaveBeenCalledExactlyOnceWith({
            lockedRefreshToken: 'current-token',
            result,
        });
        persisted.resolve();
        const values = await Promise.all([first, second, third]);
        expect(values[0]).toEqual({
            result,
            refreshTokenUsed: 'current-token',
        });
        expect(values[1]).toBe(values[0]);
        expect(values[2]).toBe(values[0]);
        expect(run.exchange).toHaveBeenCalledTimes(1);
        expect(followerRun.exchange).not.toHaveBeenCalled();
        await follower.run(followerRun);
        expect(followerRun.exchange).toHaveBeenCalledTimes(1);
    });

    test('runs different rows independently', async () => {
        const { database } = createDatabase();
        const coordinator = new RefreshTokenRotation({ database });
        const first = startedRun();
        const second = startedRun('row-2');
        const pending = [
            coordinator.run(first.run),
            coordinator.run(second.run),
        ];
        await Promise.all([first.started, second.started]);
        first.exchanged.resolve({ token: 'first' });
        second.exchanged.resolve({ token: 'second' });
        expect(
            (await Promise.all(pending)).map(({ result }) => result.token),
        ).toEqual(['first', 'second']);
    });

    test('separates client results while using the same physical row advisory key', async () => {
        const { database, raw } = createDatabase();
        const coordinator = new RefreshTokenRotation({ database });
        const first = startedRun();
        const second = startedRun();
        second.run.shareKey = 'another-client-fingerprint';
        const pending = [
            coordinator.run(first.run),
            coordinator.run(second.run),
        ];
        await Promise.all([first.started, second.started]);
        first.exchanged.resolve({ token: 'first' });
        second.exchanged.resolve({ token: 'second' });
        const results = await Promise.all(pending);
        expect(results[0].result.token).toBe('first');
        expect(results[1].result.token).toBe('second');
        expect(
            raw.mock.calls.filter(([sql]) => sql.includes('pg_advisory')),
        ).toEqual([
            [
                'select pg_advisory_xact_lock(hashtextextended(?, 0))',
                ['oauth-refresh:project:row-1:'],
            ],
            [
                'select pg_advisory_xact_lock(hashtextextended(?, 0))',
                ['oauth-refresh:project:row-1:'],
            ],
        ]);
    });

    test.each(['exchange', 'persist'] as const)(
        'cleans up a rejected %s and rejects all followers',
        async (stage) => {
            const { database } = createDatabase();
            const coordinator = new RefreshTokenRotation({ database });
            const { run, started, exchanged } = startedRun();
            const error = new Error('refresh failed');
            if (stage === 'persist') run.persist.mockRejectedValueOnce(error);
            const first = coordinator.run(run);
            await started;
            const second = coordinator.run(run);
            const results = Promise.allSettled([first, second]);
            if (stage === 'exchange') exchanged.reject(error);
            else exchanged.resolve({ token: 'first' });
            expect(await results).toEqual([
                { status: 'rejected', reason: error },
                { status: 'rejected', reason: error },
            ]);
            run.exchange.mockResolvedValue({ token: 'retry' });
            await coordinator.run(run);
            expect(run.exchange).toHaveBeenCalledTimes(2);
        },
    );

    test('rereads after acquiring the lock and uses the current token', async () => {
        const { database, raw } = createDatabase();
        const coordinator = new RefreshTokenRotation({ database });
        const acquired = deferred<void>();
        raw.mockImplementationOnce(
            async () => undefined,
        ).mockImplementationOnce(() => acquired.promise);
        const run = createRun();
        run.readCurrentRefreshToken.mockResolvedValue('stale-token');
        const pending = coordinator.run(run);
        await vi.waitFor(() => expect(raw).toHaveBeenCalledTimes(2));
        expect(run.readCurrentRefreshToken).not.toHaveBeenCalled();
        run.readCurrentRefreshToken.mockResolvedValue('rotated-token');
        acquired.resolve();
        await expect(pending).resolves.toMatchObject({
            refreshTokenUsed: 'rotated-token',
        });
        expect(run.exchange).toHaveBeenCalledExactlyOnceWith('rotated-token');
    });

    test('returns a typed error for a missing row or token', async () => {
        const { database } = createDatabase();
        const run = createRun();
        run.readCurrentRefreshToken.mockResolvedValue(null);
        await expect(
            new RefreshTokenRotation({ database }).run(run),
        ).rejects.toBeInstanceOf(RefreshTokenRowMissingError);
        expect(run.exchange).not.toHaveBeenCalled();
        expect(run.persist).not.toHaveBeenCalled();
    });

    test('maps PostgreSQL lock timeouts to a retryable error and releases admission', async () => {
        const { database, raw } = createDatabase();
        const coordinator = new RefreshTokenRotation({
            database,
            maxConcurrent: 1,
        });
        raw.mockResolvedValueOnce(undefined).mockRejectedValueOnce(
            Object.assign(new DatabaseError('lock timeout', 0, 'error'), {
                code: '55P03',
            }),
        );
        const run = createRun();
        const error = await coordinator
            .run(run)
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(RefreshTokenLockTimeoutError);
        expect(error).toBeInstanceOf(UnexpectedServerError);
        expect(error).toMatchObject({
            data: { code: 'warehouse_oauth_refresh_failed', retryable: true },
        });
        expect(run.exchange).not.toHaveBeenCalled();
        await coordinator.run(run);
        expect(run.exchange).toHaveBeenCalledTimes(1);
    });

    test('acquires shared admission before opening a transaction', async () => {
        const { database, transaction } = createDatabase();
        const firstCoordinator = new RefreshTokenRotation({
            database,
            maxConcurrent: 1,
        });
        const secondCoordinator = new RefreshTokenRotation({ database });
        const first = startedRun();
        const second = createRun('row-2');
        const firstPending = firstCoordinator.run(first.run);
        await first.started;
        const secondPending = secondCoordinator.run(second);
        await Promise.resolve();
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(second.exchange).not.toHaveBeenCalled();
        first.exchanged.resolve({ token: 'first' });
        await Promise.all([firstPending, secondPending]);
        expect(transaction).toHaveBeenCalledTimes(2);
        expect(second.exchange).toHaveBeenCalledTimes(1);
    });

    test('times out admission without opening a transaction and removes the timed-out waiter', async () => {
        vi.useFakeTimers();
        const { database, transaction } = createDatabase();
        const coordinator = new RefreshTokenRotation({
            database,
            maxConcurrent: 1,
            admissionTimeoutMs: 25,
        });
        const first = startedRun();
        const second = createRun('row-2');
        const firstPending = coordinator.run(first.run);
        await first.started;
        const rejection = coordinator
            .run(second)
            .catch((error: unknown) => error);
        await vi.advanceTimersByTimeAsync(25);
        expect(await rejection).toBeInstanceOf(RefreshTokenLockTimeoutError);
        expect(await rejection).toMatchObject({
            data: { code: 'warehouse_oauth_refresh_failed', retryable: true },
        });
        expect(transaction).toHaveBeenCalledTimes(1);
        first.exchanged.resolve({ token: 'first' });
        await firstPending;
        await coordinator.run(second);
        expect(transaction).toHaveBeenCalledTimes(2);
        expect(second.exchange).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });

    test('keeps purpose in lock keys without including tokens or the client fingerprint', async () => {
        const { database, raw } = createDatabase();
        const coordinator = new RefreshTokenRotation({ database });
        const run: RefreshRun<{ token: string }> = {
            ...createRun(),
            key: { kind: 'user', uuid: 'user-row', purpose: 'AI' },
        };
        await coordinator.run(run);
        expect(raw).toHaveBeenLastCalledWith(
            'select pg_advisory_xact_lock(hashtextextended(?, 0))',
            ['oauth-refresh:user:user-row:AI'],
        );
        const sql = JSON.stringify(raw.mock.calls);
        expect(sql).not.toContain('current-token');
        expect(sql).not.toContain('access-token');
        expect(sql).not.toContain(run.shareKey);
    });

    test('holds admission and the shared result until the transaction commits', async () => {
        const { database, transaction } = createDatabase();
        const coordinator = new RefreshTokenRotation({
            database,
            maxConcurrent: 1,
        });
        const committing = deferred<void>();
        const commit = deferred<void>();
        const original = transaction.getMockImplementation()!;
        transaction.mockImplementationOnce(async (callback) => {
            const result = await original(callback);
            committing.resolve();
            await commit.promise;
            return result;
        });
        const run = createRun();
        const first = coordinator.run(run);
        await committing.promise;
        const follower = coordinator.run(run);
        const second = coordinator.run(createRun('row-2'));
        expect(follower).toBe(first);
        expect(transaction).toHaveBeenCalledTimes(1);
        commit.resolve();
        await Promise.all([first, follower, second]);
        expect(transaction).toHaveBeenCalledTimes(2);
    });

    test('preserves other database failures and cleans up admission', async () => {
        const { database, transaction } = createDatabase();
        const coordinator = new RefreshTokenRotation({
            database,
            maxConcurrent: 1,
        });
        const failure = new Error('transaction failed');
        transaction.mockRejectedValueOnce(failure);
        await expect(coordinator.run(createRun())).rejects.toBe(failure);
        await expect(coordinator.run(createRun())).resolves.toMatchObject({
            refreshTokenUsed: 'current-token',
        });
    });

    test('defaults to two concurrent leaders', async () => {
        const { database, transaction } = createDatabase();
        const coordinator = new RefreshTokenRotation({ database });
        const first = startedRun('row-1');
        const second = startedRun('row-2');
        const pending = [
            coordinator.run(first.run),
            coordinator.run(second.run),
        ];
        await Promise.all([first.started, second.started]);
        pending.push(coordinator.run(createRun('row-3')));
        await Promise.resolve();
        expect(transaction).toHaveBeenCalledTimes(2);
        first.exchanged.resolve({ token: 'first' });
        second.exchanged.resolve({ token: 'second' });
        await Promise.all(pending);
        expect(transaction).toHaveBeenCalledTimes(3);
    });

    test('returns one shared coordinator per database', () => {
        const first = createDatabase();
        const second = createDatabase();
        expect(RefreshTokenRotation.forDatabase(first.database)).toBe(
            RefreshTokenRotation.forDatabase(first.database),
        );
        expect(RefreshTokenRotation.forDatabase(first.database)).not.toBe(
            RefreshTokenRotation.forDatabase(second.database),
        );
    });
});
