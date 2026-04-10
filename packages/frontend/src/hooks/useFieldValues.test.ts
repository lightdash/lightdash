import { QueryHistoryStatus } from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import { MAX_POLL_ATTEMPTS, pollForFieldValueResults } from './useFieldValues';

vi.mock('../api', () => ({
    lightdashApi: vi.fn(),
}));

describe('pollForFieldValueResults', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns results immediately when status is READY', async () => {
        const readyResult = {
            status: QueryHistoryStatus.READY,
            queryUuid: 'test-uuid',
            rows: [],
            columns: {},
            metadata: { performance: {} },
            pivotDetails: null,
        };

        vi.mocked(lightdashApi).mockResolvedValueOnce(readyResult as never);

        const result = await pollForFieldValueResults(
            'project-uuid',
            'query-uuid',
        );

        expect(result).toEqual(readyResult);
        expect(lightdashApi).toHaveBeenCalledTimes(1);
    });

    it('returns error results without retrying', async () => {
        const errorResult = {
            status: QueryHistoryStatus.ERROR,
            queryUuid: 'test-uuid',
            error: 'Something went wrong',
        };

        vi.mocked(lightdashApi).mockResolvedValueOnce(errorResult as never);

        const result = await pollForFieldValueResults(
            'project-uuid',
            'query-uuid',
        );

        expect(result).toEqual(errorResult);
        expect(lightdashApi).toHaveBeenCalledTimes(1);
    });

    it('polls until READY with backoff', async () => {
        const pendingResult = {
            status: QueryHistoryStatus.PENDING,
            queryUuid: 'test-uuid',
        };
        const readyResult = {
            status: QueryHistoryStatus.READY,
            queryUuid: 'test-uuid',
            rows: [
                {
                    orders_status: {
                        value: { raw: 'completed', formatted: 'completed' },
                    },
                },
            ],
            columns: {},
            metadata: { performance: {} },
            pivotDetails: null,
        };

        vi.mocked(lightdashApi)
            .mockResolvedValueOnce(pendingResult as never)
            .mockResolvedValueOnce(pendingResult as never)
            .mockResolvedValueOnce(readyResult as never);

        const pollPromise = pollForFieldValueResults(
            'project-uuid',
            'query-uuid',
        );

        // Advance through the two backoff delays (250ms, 500ms)
        await vi.advanceTimersByTimeAsync(250);
        await vi.advanceTimersByTimeAsync(500);

        const result = await pollPromise;

        expect(result).toEqual(readyResult);
        expect(lightdashApi).toHaveBeenCalledTimes(3);
    });

    it('throws after MAX_POLL_ATTEMPTS', async () => {
        const pendingResult = {
            status: QueryHistoryStatus.PENDING,
            queryUuid: 'test-uuid',
        };

        vi.mocked(lightdashApi).mockResolvedValue(pendingResult as never);

        // Catch the rejection early to prevent unhandled rejection noise
        const pollPromise = pollForFieldValueResults(
            'project-uuid',
            'query-uuid',
        ).catch((e) => e);

        // Advance timers enough for all attempts
        for (let i = 0; i < MAX_POLL_ATTEMPTS + 5; i++) {
            await vi.advanceTimersByTimeAsync(1000);
        }

        const error = await pollPromise;
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(
            'Field value search timed out. Please try again.',
        );

        expect(lightdashApi).toHaveBeenCalledTimes(MAX_POLL_ATTEMPTS);
    });
});
