import {
    createDatabase,
    deferred,
} from '../../models/RefreshTokenRotation/fakeKnex.mock';
import { RefreshTokenRotation } from '../../models/RefreshTokenRotation/RefreshTokenRotation';
import { OAuthCredentialRefresher } from './OAuthCredentialRefresher';

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

test('a failed exchange does not persist', async () => {
    const f = setup();
    const error = new Error('exchange failed');
    const persist = vi.fn();
    await expect(
        f.refresher.refresh({
            refreshToken: 'selected',
            row: null,
            exchange: async () => {
                throw error;
            },
            persist,
        }),
    ).rejects.toBe(error);
    expect(persist).not.toHaveBeenCalled();
});
