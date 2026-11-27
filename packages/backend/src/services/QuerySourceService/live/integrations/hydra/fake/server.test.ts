import {
    HYDRA_DEFAULT_SOURCE,
    TooManyRequestsError,
    type HydraApiSource,
} from '@lightdash/common';
import { toHydraError } from '../api';
import { createHydraServer } from './server';

const START = Date.parse('2026-11-23T12:00:00Z');

const settingsWith = (
    overrides: Partial<HydraApiSource> = {},
): HydraApiSource => ({ ...HYDRA_DEFAULT_SOURCE, ...overrides });

const ONE_PER_TWO_SECONDS = settingsWith({
    vendorLimits: {
        concurrentCalls: null,
        callsPerSecond: null,
        buckets: [{ id: 'burst', windowMs: 2_000, capacity: 1 }],
    },
});

/** A server on a clock the test moves, with latency that takes clock time. */
const buildServer = () => {
    let clock = START;
    const server = createHydraServer({
        now: () => new Date(clock),
        sleep: async (ms) => {
            clock += ms;
        },
    });
    const call = (settings: HydraApiSource, sourceKey = 'source-1') =>
        server.fetch({
            sourceKey,
            settings,
            token: 'alice',
            request: { method: 'GET', path: '/v1/account', body: undefined },
        });
    return {
        server,
        call,
        tick: (ms: number) => {
            clock += ms;
        },
    };
};

describe('Hydra vendor limits', () => {
    it('refuses calls past a bucket until its window resets', async () => {
        const { call, tick } = buildServer();
        expect((await call(ONE_PER_TWO_SECONDS)).status).toBe(200);
        tick(500);
        const refused = await call(ONE_PER_TWO_SECONDS);
        expect(refused.status).toBe(429);
        expect(refused.headers['retry-after']).toBe('2');
        tick(1_500);
        expect((await call(ONE_PER_TWO_SECONDS)).status).toBe(200);
    });

    it('opens a window at the first call, as the rate-limit gate does', async () => {
        const { call, tick } = buildServer();
        const settings = settingsWith({
            vendorLimits: {
                concurrentCalls: null,
                callsPerSecond: null,
                buckets: [{ id: 'minute', windowMs: 60_000, capacity: 1 }],
            },
        });
        tick(59_500);
        expect((await call(settings)).status).toBe(200);
        // A clock-aligned minute would have reset at 12:01:00
        tick(1_000);
        const refused = await call(settings);
        expect(refused.status).toBe(429);
        expect(refused.headers['retry-after']).toBe('59');
    });

    it('limits calls per second as a one-second window', async () => {
        const { call, tick } = buildServer();
        const settings = settingsWith({
            vendorLimits: {
                concurrentCalls: null,
                callsPerSecond: 2,
                buckets: [],
            },
        });
        expect((await call(settings)).status).toBe(200);
        expect((await call(settings)).status).toBe(200);
        expect((await call(settings)).status).toBe(429);
        tick(1_000);
        expect((await call(settings)).status).toBe(200);
    });

    it('refuses a call past its concurrent calls', async () => {
        let release = () => {};
        const server = createHydraServer({
            now: () => new Date(START),
            sleep: () =>
                new Promise((resolve) => {
                    release = resolve;
                }),
        });
        const settings = settingsWith({
            latencyMs: 100,
            vendorLimits: {
                concurrentCalls: 1,
                callsPerSecond: null,
                buckets: [],
            },
        });
        const call = () =>
            server.fetch({
                sourceKey: 'source-1',
                settings,
                token: 'alice',
                request: {
                    method: 'GET',
                    path: '/v1/account',
                    body: undefined,
                },
            });
        const running = call();
        expect((await call()).status).toBe(429);
        release();
        expect((await running).status).toBe(200);
        expect(server.getStats('source-1')).toMatchObject({
            calls: 2,
            refused: 1,
            maxInFlight: 1,
        });
    });

    it('refuses the way onLimit says: status, Retry-After date, body', async () => {
        const { call } = buildServer();
        const settings = {
            ...ONE_PER_TWO_SECONDS,
            onLimit: {
                status: 403,
                retryAfterFormat: 'date' as const,
                body: { code: 'rate_limited', message: 'Slow down' },
            },
        };
        await call(settings);
        const refused = await call(settings);
        expect(refused).toMatchObject({
            status: 403,
            headers: { 'retry-after': 'Mon, 23 Nov 2026 12:00:02 GMT' },
            body: { code: 'rate_limited', message: 'Slow down' },
        });
        const error = toHydraError(refused, new Date(START));
        expect(error).toBeInstanceOf(TooManyRequestsError);
        expect(error).toMatchObject({ data: { retryAfterSeconds: 2 } });
    });

    it('enforces nothing with no vendor limits', async () => {
        const { call } = buildServer();
        const settings = settingsWith({ vendorLimits: null });
        const statuses = await Promise.all(
            Array.from({ length: 50 }, () => call(settings)),
        );
        expect(statuses.every(({ status }) => status === 200)).toBe(true);
    });
});

describe('Hydra stats', () => {
    it('counts calls, refusals, gaps and the busiest window per source', async () => {
        const { server, call, tick } = buildServer();
        await call(ONE_PER_TWO_SECONDS);
        await call(ONE_PER_TWO_SECONDS);
        tick(2_500);
        await call(ONE_PER_TWO_SECONDS);
        await call(ONE_PER_TWO_SECONDS, 'source-2');
        expect(server.getStats('source-1')).toEqual({
            calls: 3,
            refused: 1,
            maxInFlight: 1,
            minGapMs: 2_500,
            peakPerBucket: { burst: 1 },
        });
        expect(server.getStats('source-2')).toMatchObject({ calls: 1 });
    });

    it('starts call numbers over after a reset, for mock responses', async () => {
        const { server, call } = buildServer();
        const settings = settingsWith({
            mockResponses: [{ call: 1, status: 503 }],
        });
        expect((await call(settings)).status).toBe(503);
        expect((await call(settings)).status).toBe(200);
        server.reset('source-1');
        expect((await call(settings)).status).toBe(503);
    });

    it('adds jitter to the latency', async () => {
        const sleep = vi.fn().mockResolvedValue(undefined);
        const server = createHydraServer({
            now: () => new Date(START),
            sleep,
            random: () => 0.5,
        });
        await server.fetch({
            sourceKey: 'source-1',
            settings: settingsWith({ latencyMs: 100, jitterMs: 40 }),
            token: 'alice',
            request: { method: 'GET', path: '/v1/account', body: undefined },
        });
        expect(sleep).toHaveBeenCalledWith(120);
    });
});
