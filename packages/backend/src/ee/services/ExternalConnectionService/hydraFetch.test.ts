import {
    HYDRA_DEFAULT_SETTINGS,
    TooManyRequestsError,
    type HydraApiSource,
} from '@lightdash/common';
import { hydraIntegration } from '../../../services/QuerySourceService/live/integrations/hydra';
import { createHydraServer } from '../../../services/QuerySourceService/live/integrations/hydra/server';
import { SecureFetchError } from '../../../utils/secureFetch/secureFetch';
import { ApiSourceCallLimiter } from './ApiSourceCallLimiter';
import { fetchFromHydra } from './hydraFetch';

const NOW = Date.parse('2026-11-23T12:00:20Z');
const CONNECTION = {
    externalConnectionUuid: 'connection-1',
    name: 'Hydra',
    timeoutMs: 30_000,
};

const settingsWith = (overrides: Partial<HydraApiSource> = {}) => ({
    ...HYDRA_DEFAULT_SETTINGS,
    ...overrides,
});

const accountCall = (settings: HydraApiSource, timeoutMs = 30_000) =>
    fetchFromHydra({
        connectionUuid: CONNECTION.externalConnectionUuid,
        settings,
        secret: 'alice',
        timeoutMs,
        request: { method: 'GET', path: '/v1/account' },
        server: createHydraServer({
            now: () => new Date(NOW),
            sleep: vi.fn(),
        }),
        sleep: vi.fn(),
    });

/** The limiter over an in-memory call log, as the database keeps it. */
const buildLimiter = () => {
    const counts = new Map<string, number>();
    const model = {
        tryAcquireApiSourceCallLease: vi.fn(async () => true),
        tryCountApiSourceCall: vi.fn(
            async (
                uuid: string,
                windowSeconds: number,
                windowStartedAt: Date,
                limit: number,
            ) => {
                const key = `${uuid}:${windowSeconds}:${windowStartedAt.toISOString()}`;
                const count = counts.get(key) ?? 0;
                if (count >= limit) return false;
                counts.set(key, count + 1);
                return true;
            },
        ),
        releaseApiSourceCallLease: vi.fn(async () => undefined),
    };
    return new ApiSourceCallLimiter({
        model,
        now: () => new Date(NOW),
        sleep: vi.fn(async () => undefined),
    });
};

describe('fetchFromHydra', () => {
    it('answers in-process in the shape the guarded fetch returns', async () => {
        const fetched = await accountCall(settingsWith({ rowCount: 20 }));
        expect(fetched).toMatchObject({
            status: 200,
            contentType: 'application/json',
            truncated: false,
        });
        expect(JSON.parse(fetched.bodyText)).toMatchObject({
            events: 20,
            users: 10,
        });
    });

    it('passes a 429 Retry-After header through', async () => {
        const fetched = await accountCall(
            settingsWith({ retryAfterEvery: 1, retryAfterSeconds: 9 }),
        );
        expect(fetched.status).toBe(429);
        expect(fetched.headers['retry-after']).toBe('9');
    });

    it('times out like a slow API when its latency reaches the timeout', async () => {
        await expect(
            accountCall(settingsWith({ latencyMs: 5_000 }), 5_000),
        ).rejects.toMatchObject({ reason: 'timeout' });
        await expect(
            accountCall(settingsWith({ latencyMs: 5_000 }), 5_000),
        ).rejects.toBeInstanceOf(SecureFetchError);
    });
});

describe('the call limiter, through Hydra', () => {
    const settings = settingsWith({ callsPerMinute: 2, callsPerHour: 100 });
    const limits = hydraIntegration.limitsFor!(settings);

    it("refuses a call past the source's own per-minute limit, saying when to retry", async () => {
        const limiter = buildLimiter();
        const call = () => limiter.run(CONNECTION, limits, async () => 'rows');
        await expect(call()).resolves.toBe('rows');
        await expect(call()).resolves.toBe('rows');
        const refused = call();
        await expect(refused).rejects.toBeInstanceOf(TooManyRequestsError);
        // 20 seconds into the minute window
        await expect(refused).rejects.toMatchObject({
            data: { retryAfterSeconds: 40 },
        });
    });

    // Needs the queueing limiter (lightdash/lightdash#33198, SPK-3113): on
    // main a call past the limit is refused instead of waiting its turn.
    it.todo(
        'waits for the next window instead of refusing a call past the limit',
    );

    // Needs lightdash/lightdash#33199 (SPK-3173): on main a vendor 429 fails
    // the query with its Retry-After instead of waiting it out and retrying.
    it.todo("waits out Hydra's Retry-After and retries the call");
});
