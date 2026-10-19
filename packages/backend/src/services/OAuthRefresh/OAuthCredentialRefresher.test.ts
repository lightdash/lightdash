import {
    createDatabase,
    deferred,
} from '../../models/RefreshTokenRotation/fakeKnex.mock';
import {
    RefreshTokenRotation,
    RefreshTokenRowMissingError,
} from '../../models/RefreshTokenRotation/RefreshTokenRotation';
import {
    OAuthCredentialRefresher,
    OAuthRefreshExchangeError,
} from './OAuthCredentialRefresher';

const setup = () => {
    const { database, transaction } = createDatabase();
    const rotation = new RefreshTokenRotation({ database });
    const run = vi.spyOn(rotation, 'run');
    return {
        refresher: new OAuthCredentialRefresher(rotation),
        run,
        transaction,
    };
};

test('unlocked exchanges preserve an omitted refresh token and use legacy persistence', async () => {
    const f = setup();
    const result = { accessToken: 'access' };
    const exchange = vi.fn().mockResolvedValue(result);
    const persist = vi.fn().mockResolvedValue(undefined);
    await expect(
        f.refresher.refresh({
            refreshToken: 'selected',
            row: null,
            exchange,
            persist,
        }),
    ).resolves.toBe(result);
    expect(exchange).toHaveBeenCalledExactlyOnceWith('selected');
    expect(persist).toHaveBeenCalledExactlyOnceWith({
        lockedRefreshToken: 'selected',
        result,
    });
    expect(f.run).not.toHaveBeenCalled();
});

test('locked callers share the reread, exchange and persistence on the held transaction', async () => {
    const f = setup();
    const started = deferred<void>();
    const exchanged = deferred<{ accessToken: string; refreshToken: string }>();
    const readCurrentRefreshToken = vi.fn().mockResolvedValue('current');
    const exchange = vi.fn(() => {
        started.resolve();
        return exchanged.promise;
    });
    const persist = vi.fn().mockResolvedValue(undefined);
    const args = {
        refreshToken: 'stale',
        row: {
            key: { kind: 'project' as const, uuid: 'row', purpose: null },
            shareKey: 'provider',
            readCurrentRefreshToken,
        },
        exchange,
        persist,
    };
    const first = f.refresher.refresh(args);
    await started.promise;
    const second = f.refresher.refresh(args);
    const result = { accessToken: 'access', refreshToken: 'rotated' };
    exchanged.resolve(result);
    expect(await first).toBe(result);
    expect(await second).toBe(result);
    expect(exchange).toHaveBeenCalledExactlyOnceWith('current');
    expect(readCurrentRefreshToken).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledExactlyOnceWith({
        lockedRefreshToken: 'current',
        result,
        trx: readCurrentRefreshToken.mock.calls[0][0],
    });
    expect(f.transaction).toHaveBeenCalledTimes(1);
});

test.each([true, false])(
    'a failed exchange carries the sent token and does not persist with lock %s',
    async (locked) => {
        const f = setup();
        const error = new Error('exchange failed');
        const persist = vi.fn();
        const exchange = vi.fn().mockRejectedValue(error);
        const result = f.refresher.refresh({
            refreshToken: 'selected',
            row: locked
                ? {
                      key: { kind: 'project', uuid: 'row', purpose: null },
                      shareKey: 'provider',
                      readCurrentRefreshToken: async () => 'reread',
                  }
                : null,
            exchange,
            persist,
        });
        await expect(result).rejects.toBeInstanceOf(OAuthRefreshExchangeError);
        await expect(result).rejects.toMatchObject({
            originalError: error,
            refreshToken: locked ? 'reread' : 'selected',
        });
        expect(exchange).toHaveBeenCalledExactlyOnceWith(
            locked ? 'reread' : 'selected',
        );
        expect(persist).not.toHaveBeenCalled();
    },
);

test('a reread failure passes through unchanged', async () => {
    const f = setup();
    const error = new RefreshTokenRowMissingError();
    const exchange = vi.fn();
    const persist = vi.fn();
    await expect(
        f.refresher.refresh({
            refreshToken: 'selected',
            row: {
                key: { kind: 'project', uuid: 'row', purpose: null },
                shareKey: 'provider',
                readCurrentRefreshToken: async () => {
                    throw error;
                },
            },
            exchange,
            persist,
        }),
    ).rejects.toBe(error);
    expect(exchange).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
});

test.each([true, false])(
    'a persist failure passes through unchanged with lock %s',
    async (locked) => {
        const f = setup();
        const error = new Error('persist failed');
        await expect(
            f.refresher.refresh({
                refreshToken: 'selected',
                row: locked
                    ? {
                          key: { kind: 'project', uuid: 'row', purpose: null },
                          shareKey: 'provider',
                          readCurrentRefreshToken: async () => 'reread',
                      }
                    : null,
                exchange: async () => ({ accessToken: 'access' }),
                persist: async () => {
                    throw error;
                },
            }),
        ).rejects.toBe(error);
    },
);
