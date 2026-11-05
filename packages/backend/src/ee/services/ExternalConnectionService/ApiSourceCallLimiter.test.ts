import { TooManyRequestsError } from '@lightdash/common';
import { ApiSourceCallLimiter, getWindowStart } from './ApiSourceCallLimiter';

const NOW = Date.parse('2026-10-28T12:00:20Z');
const limits = {
    concurrentCalls: 3,
    callsPerMinute: 240,
    callsPerHour: 2_400,
    callsPerQuery: 1,
};
const connection = {
    externalConnectionUuid: 'connection-1',
    name: 'PostHog',
    timeoutMs: 30_000,
};

const buildLimiter = ({
    leases = [true],
    counted = { 60: true, 3600: true } as Record<number, boolean>,
} = {}) => {
    let clock = NOW;
    const model = {
        tryAcquireApiSourceCallLease: vi.fn(
            async (
                _uuid: string,
                _slots: number,
                _leaseUuid: string,
                _expiresAt: Date,
            ) => leases.shift() ?? false,
        ),
        tryCountApiSourceCall: vi.fn(
            async (_uuid: string, windowSeconds: number) =>
                counted[windowSeconds],
        ),
        releaseApiSourceCallLease: vi.fn().mockResolvedValue(undefined),
    };
    const sleep = vi.fn(async (ms: number) => {
        clock += ms;
    });
    const limiter = new ApiSourceCallLimiter({
        model,
        now: () => new Date(clock),
        sleep,
    });
    return { limiter, model, sleep };
};

describe('ApiSourceCallLimiter', () => {
    it('counts the call in both windows and frees its slot afterwards', async () => {
        const { limiter, model } = buildLimiter();

        await expect(
            limiter.run(connection, limits, async () => 'rows'),
        ).resolves.toBe('rows');

        const [, slots, leaseUuid, expiresAt] =
            model.tryAcquireApiSourceCallLease.mock.calls[0];
        expect(slots).toBe(3);
        expect(expiresAt).toEqual(new Date(NOW + 45_000));
        expect(model.tryCountApiSourceCall.mock.calls).toEqual([
            ['connection-1', 60, new Date('2026-10-28T12:00:00Z'), 240],
            ['connection-1', 3_600, new Date('2026-10-28T12:00:00Z'), 2_400],
        ]);
        expect(model.releaseApiSourceCallLease).toHaveBeenCalledWith(
            'connection-1',
            leaseUuid,
        );
    });

    it('waits for a busy connection to free a slot', async () => {
        const { limiter, sleep } = buildLimiter({ leases: [false, true] });

        await expect(
            limiter.run(connection, limits, async () => 'rows'),
        ).resolves.toBe('rows');
        expect(sleep).toHaveBeenCalledOnce();
    });

    it('gives up on a connection that stays busy', async () => {
        const call = vi.fn();
        const { limiter, model } = buildLimiter({ leases: [] });

        await expect(limiter.run(connection, limits, call)).rejects.toThrow(
            'Connection "PostHog" is already running 3 queries at once. Retry in 5 seconds.',
        );
        expect(call).not.toHaveBeenCalled();
        expect(model.releaseApiSourceCallLease).not.toHaveBeenCalled();
    });

    it('refuses a call over the per-minute limit with the wait until the next window', async () => {
        const call = vi.fn();
        const { limiter, model } = buildLimiter({
            counted: { 60: false, 3600: true },
        });

        const run = limiter.run(connection, limits, call);
        await expect(run).rejects.toBeInstanceOf(TooManyRequestsError);
        await expect(run).rejects.toThrow(
            'Connection "PostHog" reached its limit of 240 calls per minute. Retry after 40 seconds.',
        );
        expect(call).not.toHaveBeenCalled();
        expect(model.releaseApiSourceCallLease).toHaveBeenCalledOnce();
    });

    it('frees the slot when the call fails', async () => {
        const { limiter, model } = buildLimiter();

        await expect(
            limiter.run(connection, limits, async () => {
                throw new Error('PostHog is down');
            }),
        ).rejects.toThrow('PostHog is down');
        expect(model.releaseApiSourceCallLease).toHaveBeenCalledOnce();
    });
});

describe('getWindowStart', () => {
    it('aligns to the start of the window', () => {
        expect(getWindowStart(new Date(NOW), 3_600)).toEqual(
            new Date('2026-10-28T12:00:00Z'),
        );
        expect(getWindowStart(new Date('2026-10-28T12:59:59Z'), 60)).toEqual(
            new Date('2026-10-28T12:59:00Z'),
        );
    });
});
