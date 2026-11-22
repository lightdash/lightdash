import { TooManyRequestsError } from '@lightdash/common';
import type {
    ApiSourceRateCharge,
    ApiSourceRateTurn,
} from '../../models/ExternalConnectionModel';
import {
    ApiSourceCallLimiter,
    type RateLimitTarget,
} from './ApiSourceCallLimiter';

const NOW = Date.parse('2026-11-22T14:00:00Z');
const WINDOW = new Date(NOW);

const target = (
    rateLimits: Partial<RateLimitTarget['rateLimits']> = {},
): RateLimitTarget => ({
    limitKey: 'connection-1',
    integration: 'hubspot',
    label: 'HubSpot',
    timeoutMs: 30_000,
    rateLimits: {
        concurrentCalls: 2,
        callsPerSecond: null,
        buckets: [
            {
                id: 'hour',
                label: 'per hour',
                windowMs: 3_600_000,
                capacity: 10_000,
            },
        ],
        ...rateLimits,
    },
});

const charged = (now: number): ApiSourceRateCharge => ({
    charged: true,
    now: new Date(now),
    windows: [{ bucketId: 'hour', windowStartedAt: WINDOW }],
});

const buildLimiter = ({
    charges = [] as ((now: number) => ApiSourceRateCharge)[],
    turns = [] as ((now: number) => ApiSourceRateTurn)[],
    slots = 2,
} = {}) => {
    let clock = NOW;
    const held = new Set<string>();
    const model = {
        chargeApiSourceRateBuckets: vi.fn(
            async (): Promise<ApiSourceRateCharge> =>
                (charges.shift() ?? charged)(clock),
        ),
        refundApiSourceRateBuckets: vi.fn().mockResolvedValue(undefined),
        holdApiSourceRateBuckets: vi.fn().mockResolvedValue(undefined),
        bookApiSourceRateTurn: vi.fn(
            async (): Promise<ApiSourceRateTurn> =>
                (
                    turns.shift() ??
                    ((now) => ({
                        booked: true,
                        turnAt: new Date(now),
                        now: new Date(now),
                    }))
                )(clock),
        ),
        tryTakeApiSourceRateSlot: vi.fn(
            async (_key: string, _slots: number, leaseUuid: string) => {
                if (held.size >= slots) return false;
                held.add(leaseUuid);
                return true;
            },
        ),
        releaseApiSourceRateSlot: vi.fn(
            async (_key: string, leaseUuid: string) => {
                held.delete(leaseUuid);
            },
        ),
    };
    const sleep = vi.fn(async (ms: number) => {
        clock += ms;
        // Let other waiting calls run, as a real timer would
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
    });
    const metrics = {
        observeLiveSourceRateWait: vi.fn(),
        incrementLiveSourceRateRefusal: vi.fn(),
    };
    const limiter = new ApiSourceCallLimiter({
        model,
        metrics,
        now: () => new Date(clock),
        sleep,
    });
    return { limiter, model, sleep, metrics, held };
};

const refusal = async (promise: Promise<unknown>) => {
    const error = await promise.then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(TooManyRequestsError);
    return error as TooManyRequestsError;
};

describe('ApiSourceCallLimiter', () => {
    it('charges the buckets, takes a slot, and frees it afterwards', async () => {
        const { limiter, model, held, metrics } = buildLimiter();

        await expect(
            limiter.run(target(), async (turn) => turn),
        ).resolves.toEqual({
            limitKey: 'connection-1',
            buckets: ['hour'],
            waitedMs: 0,
        });

        expect(model.chargeApiSourceRateBuckets).toHaveBeenCalledWith(
            'connection-1',
            target().rateLimits.buckets,
        );
        // No per-second limit: no paced turn
        expect(model.bookApiSourceRateTurn).not.toHaveBeenCalled();
        expect(model.tryTakeApiSourceRateSlot).toHaveBeenCalledWith(
            'connection-1',
            2,
            expect.any(String),
            45_000,
        );
        expect(held.size).toBe(0);
        expect(metrics.observeLiveSourceRateWait).toHaveBeenCalledWith(
            'hubspot',
            0,
        );
    });

    it('frees the slot when the call fails', async () => {
        const { limiter, held, model } = buildLimiter();

        await expect(
            limiter.run(target(), async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');
        expect(held.size).toBe(0);
        // A sent call stays charged
        expect(model.refundApiSourceRateBuckets).not.toHaveBeenCalled();
    });

    it('keeps the result of the call when freeing its slot fails', async () => {
        const { limiter, model } = buildLimiter();
        model.releaseApiSourceRateSlot.mockRejectedValueOnce(
            new Error('connection reset'),
        );

        await expect(limiter.run(target(), async () => 'rows')).resolves.toBe(
            'rows',
        );
    });

    it('runs 6 calls through 2 slots, all of them, in arrival order', async () => {
        const { limiter, sleep } = buildLimiter();
        const started: number[] = [];

        await Promise.all(
            [0, 1, 2, 3, 4, 5].map((i) =>
                limiter.run(target(), async () => {
                    started.push(i);
                    await sleep(1_000);
                }),
            ),
        );

        expect(started).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('waits for a full bucket to reset when that comes before the deadline', async () => {
        const { limiter, model, sleep } = buildLimiter({
            charges: [
                (now) => ({
                    charged: false,
                    now: new Date(now),
                    bucketId: 'hour',
                    used: 10_000,
                    resumesAt: new Date(now + 2_000),
                    isHeldByVendor: false,
                }),
            ],
        });

        await expect(limiter.run(target(), async () => 'rows')).resolves.toBe(
            'rows',
        );
        expect(sleep).toHaveBeenCalledWith(2_000);
        expect(model.chargeApiSourceRateBuckets).toHaveBeenCalledTimes(2);
    });

    it('refuses a full bucket that resets past the deadline, saying when', async () => {
        const call = vi.fn();
        const { limiter, model, metrics } = buildLimiter({
            charges: [
                (now) => ({
                    charged: false,
                    now: new Date(now),
                    bucketId: 'hour',
                    used: 10_000,
                    resumesAt: new Date(now + 20 * 60_000),
                    isHeldByVendor: false,
                }),
            ],
        });

        const error = await refusal(limiter.run(target(), call));

        expect(error.message).toBe(
            'HubSpot limit reached (10,000/10,000 calls per hour). Resumes at 14:20 UTC.',
        );
        expect(error.data).toEqual({
            retryAfterSeconds: 1_200,
            resumesAt: '2026-11-22T14:20:00.000Z',
            bucket: { id: 'hour', label: 'per hour' },
            used: 10_000,
            limit: 10_000,
            liveSourceErrorCode: 'live_source.upstream.rate_limited',
            liveSourceErrorCodes: ['live_source.upstream.rate_limited'],
        });
        expect(call).not.toHaveBeenCalled();
        expect(model.tryTakeApiSourceRateSlot).not.toHaveBeenCalled();
        expect(metrics.incrementLiveSourceRateRefusal).toHaveBeenCalledWith(
            'hubspot',
            'live_source.upstream.rate_limited',
        );
    });

    it('waits for its paced turn', async () => {
        const { limiter, model, sleep } = buildLimiter({
            turns: [
                (now) => ({
                    booked: true,
                    turnAt: new Date(now + 750),
                    now: new Date(now),
                }),
            ],
        });

        await limiter.run(target({ callsPerSecond: 4 }), async () => 'rows');

        expect(model.bookApiSourceRateTurn).toHaveBeenCalledWith(
            'connection-1',
            250,
            60_000,
        );
        expect(sleep).toHaveBeenCalledWith(750);
    });

    it('gives the charge back when no paced turn comes before the deadline', async () => {
        const call = vi.fn();
        const { limiter, model } = buildLimiter({
            turns: [
                (now) => ({
                    booked: false,
                    turnAt: new Date(now + 90_000),
                    now: new Date(now),
                }),
            ],
        });

        const error = await refusal(
            limiter.run(target({ callsPerSecond: 4 }), call),
        );

        expect(error.data.resumesAt).toBe('2026-11-22T14:01:30.000Z');
        expect(model.refundApiSourceRateBuckets).toHaveBeenCalledWith(
            'connection-1',
            [{ bucketId: 'hour', windowStartedAt: WINDOW }],
        );
        expect(call).not.toHaveBeenCalled();
    });

    it('gives the charge back when no slot frees up before the deadline', async () => {
        const call = vi.fn();
        const { limiter, model } = buildLimiter({ slots: 0 });

        const error = await refusal(
            limiter.run(target(), call, { deadlineMs: 1_000 }),
        );

        expect(error.data.liveSourceErrorCode).toBe(
            'live_source.internal.concurrency_limit',
        );
        expect(error.message).toBe(
            'HubSpot is already running 2 calls at once. Retry in 5 seconds.',
        );
        expect(model.refundApiSourceRateBuckets).toHaveBeenCalledOnce();
        expect(call).not.toHaveBeenCalled();
    });

    it('charges nothing for an integration without buckets', async () => {
        const { limiter, model } = buildLimiter();

        await limiter.run(target({ buckets: [] }), async () => 'rows');

        expect(model.chargeApiSourceRateBuckets).not.toHaveBeenCalled();
    });

    describe('when the integration says to slow down', () => {
        const limitedFor = (seconds: number | null) => (result: string) =>
            result === 'limited'
                ? {
                      resumesAt:
                          seconds === null
                              ? null
                              : new Date(NOW + seconds * 1_000),
                  }
                : null;

        it('holds the charged buckets and retries the call', async () => {
            const { limiter, model } = buildLimiter();
            const call = vi
                .fn()
                .mockResolvedValueOnce('limited')
                .mockResolvedValueOnce('rows');

            await expect(
                limiter.run(target(), call, { readRateLimit: limitedFor(4) }),
            ).resolves.toBe('rows');

            expect(call).toHaveBeenCalledTimes(2);
            expect(model.holdApiSourceRateBuckets).toHaveBeenCalledWith(
                'connection-1',
                target().rateLimits.buckets,
                new Date(NOW + 4_000),
            );
            // The retry is a call too, so it is charged again
            expect(model.chargeApiSourceRateBuckets).toHaveBeenCalledTimes(2);
        });

        it('retries at most twice, then returns what the integration said', async () => {
            const { limiter, model } = buildLimiter();
            const call = vi.fn().mockResolvedValue('limited');

            await expect(
                limiter.run(target(), call, {
                    readRateLimit: limitedFor(null),
                }),
            ).resolves.toBe('limited');

            expect(call).toHaveBeenCalledTimes(3);
            expect(model.holdApiSourceRateBuckets).toHaveBeenCalledWith(
                'connection-1',
                target().rateLimits.buckets,
                null,
            );
        });

        it('refuses at once when the hold lasts past the deadline', async () => {
            const call = vi.fn().mockResolvedValue('limited');
            const { limiter } = buildLimiter({
                charges: [
                    charged,
                    (now) => ({
                        charged: false,
                        now: new Date(now),
                        bucketId: 'hour',
                        used: 12,
                        resumesAt: new Date(now + 5 * 60_000),
                        isHeldByVendor: true,
                    }),
                ],
            });

            const error = await refusal(
                limiter.run(target(), call, {
                    readRateLimit: limitedFor(300),
                }),
            );

            expect(error.message).toBe(
                'HubSpot asked Lightdash to slow down. Resumes at 14:05 UTC.',
            );
            expect(error.data.resumesAt).toBe('2026-11-22T14:05:00.000Z');
            expect(call).toHaveBeenCalledOnce();
        });

        it('does not retry a result that is not a rate limit', async () => {
            const { limiter, model } = buildLimiter();
            const call = vi.fn().mockResolvedValue('server error');

            await limiter.run(target(), call, {
                readRateLimit: limitedFor(4),
            });

            expect(call).toHaveBeenCalledOnce();
            expect(model.holdApiSourceRateBuckets).not.toHaveBeenCalled();
        });
    });
});
