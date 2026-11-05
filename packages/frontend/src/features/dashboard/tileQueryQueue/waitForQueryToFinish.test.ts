import { QueryHistoryStatus } from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LightdashApi } from '../../../api';
import { waitForQueryToFinish } from './waitForQueryToFinish';

const apiReturning = (...outcomes: Array<QueryHistoryStatus | Error>) => {
    const queue = [...outcomes];
    return vi.fn(async () => {
        const next = queue.shift();
        if (next instanceof Error) {
            throw next;
        }
        return { status: next };
    }) as unknown as LightdashApi & ReturnType<typeof vi.fn>;
};

describe('waitForQueryToFinish', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('resolves only once the query stops running', async () => {
        const api = apiReturning(
            QueryHistoryStatus.QUEUED,
            QueryHistoryStatus.EXECUTING,
            QueryHistoryStatus.READY,
        );
        let isDone = false;
        void waitForQueryToFinish(api, 'project', 'query').then(() => {
            isDone = true;
        });

        await vi.advanceTimersByTimeAsync(250);
        expect(isDone).toBe(false);
        await vi.advanceTimersByTimeAsync(500);

        expect(isDone).toBe(true);
        expect(api).toHaveBeenCalledTimes(3);
        expect(api).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project/query/query?page=1&pageSize=1',
            }),
        );
    });

    it('resolves when the status cannot be read', async () => {
        const api = apiReturning(
            QueryHistoryStatus.EXECUTING,
            new Error('network down'),
        );
        const done = waitForQueryToFinish(api, 'project', 'query');

        await vi.advanceTimersByTimeAsync(250);

        await expect(done).resolves.toBeUndefined();
        expect(api).toHaveBeenCalledTimes(2);
    });
});
