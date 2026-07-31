import { LightdashError } from '@lightdash/common';
import { createBuildLimitWaitState, withBuildLimitRetry } from './uploadRetry';

const buildLimitError = () =>
    new LightdashError({
        message:
            'Too many app builds in progress for this project (5/5). Wait for some to finish and try again.',
        name: 'TooManyRequestsError',
        statusCode: 429,
        data: {},
    });

describe('withBuildLimitRetry', () => {
    it('retries 429s with backoff until the upload is accepted and refills the budget', async () => {
        const sleeps: number[] = [];
        const sleep = vi.fn(async (ms: number) => {
            sleeps.push(ms);
        });
        const onWait = vi.fn();
        const post = vi
            .fn()
            .mockRejectedValueOnce(buildLimitError())
            .mockRejectedValueOnce(buildLimitError())
            .mockResolvedValue('accepted');
        const waitState = createBuildLimitWaitState(600_000);
        waitState.spend(500_000); // partially spent by earlier apps

        const result = await withBuildLimitRetry(post, waitState, {
            onWait,
            initialDelayMs: 5_000,
            maxDelayMs: 30_000,
            sleep,
        });

        expect(result).toBe('accepted');
        expect(post).toHaveBeenCalledTimes(3);
        expect(sleeps).toEqual([5_000, 10_000]);
        expect(onWait).toHaveBeenNthCalledWith(1, 1, 5_000);
        expect(onWait).toHaveBeenNthCalledWith(2, 2, 10_000);
        // Progress refills the shared budget for the remaining apps
        expect(waitState.remainingMs()).toBe(600_000);
    });

    it('caps the backoff delay at maxDelayMs', async () => {
        const sleeps: number[] = [];
        const post = vi
            .fn()
            .mockRejectedValueOnce(buildLimitError())
            .mockRejectedValueOnce(buildLimitError())
            .mockRejectedValueOnce(buildLimitError())
            .mockRejectedValueOnce(buildLimitError())
            .mockResolvedValue('accepted');

        await withBuildLimitRetry(post, createBuildLimitWaitState(600_000), {
            onWait: vi.fn(),
            initialDelayMs: 5_000,
            maxDelayMs: 15_000,
            sleep: async (ms) => {
                sleeps.push(ms);
            },
        });

        expect(sleeps).toEqual([5_000, 10_000, 15_000, 15_000]);
    });

    it('rethrows non-429 errors without sleeping', async () => {
        const sleep = vi.fn();
        const notFound = new LightdashError({
            message: 'not found',
            name: 'NotFoundError',
            statusCode: 404,
            data: {},
        });
        const post = vi.fn().mockRejectedValue(notFound);

        await expect(
            withBuildLimitRetry(post, createBuildLimitWaitState(), {
                onWait: vi.fn(),
                sleep,
            }),
        ).rejects.toThrow('not found');
        expect(post).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });

    it('rethrows the 429 once the wait budget is exhausted', async () => {
        const sleeps: number[] = [];
        const post = vi.fn().mockRejectedValue(buildLimitError());
        const waitState = createBuildLimitWaitState(12_000);

        await expect(
            withBuildLimitRetry(post, waitState, {
                onWait: vi.fn(),
                initialDelayMs: 5_000,
                maxDelayMs: 30_000,
                sleep: async (ms) => {
                    sleeps.push(ms);
                },
            }),
        ).rejects.toThrow('Too many app builds in progress');

        // 5s, then 10s capped to the 7s remaining, then the budget is spent
        expect(sleeps).toEqual([5_000, 7_000]);
        expect(waitState.remainingMs()).toBe(0);
        expect(post).toHaveBeenCalledTimes(3);
    });

    it('fails fast on 429 when a previous app already exhausted the budget', async () => {
        const sleep = vi.fn();
        const post = vi.fn().mockRejectedValue(buildLimitError());
        const waitState = createBuildLimitWaitState(600_000);
        waitState.spend(600_000);

        await expect(
            withBuildLimitRetry(post, waitState, {
                onWait: vi.fn(),
                sleep,
            }),
        ).rejects.toThrow('Too many app builds in progress');
        expect(post).toHaveBeenCalledTimes(1);
        expect(sleep).not.toHaveBeenCalled();
    });
});
