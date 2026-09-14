import * as Sentry from '@sentry/node';
import type { Job } from 'graphile-worker';
import { afterEach, vi } from 'vitest';
import { tryJobOrTimeout } from './SchedulerJobTimeout';

vi.mock('@sentry/node', async (importOriginal) => {
    const sentry = await importOriginal<typeof import('@sentry/node')>();
    return { ...sentry, captureException: vi.fn() };
});

const job = {
    id: 'job-id',
    queue_name: 'ai-agent-memory-distill:project',
    locked_by: 'worker-id',
    task_identifier: 'aiAgentMemoryDistill',
    payload: {},
    priority: 10,
    run_at: new Date(),
    attempts: 1,
    max_attempts: 1,
    last_error: null,
    created_at: new Date(),
    updated_at: new Date(),
    key: null,
    revision: 0,
    locked_at: new Date(),
    flags: null,
} satisfies Job;

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe('tryJobOrTimeout', () => {
    it('keeps the job pending while timeout cleanup waits for work to stop', async () => {
        vi.useFakeTimers();
        let finishWork: () => void = () => {};
        const work = new Promise<void>((resolve) => {
            finishWork = resolve;
        });
        const onTimeout = vi.fn(async () => {
            await work;
        });
        let settled = false;

        const guarded = tryJobOrTimeout(work, job, 100, onTimeout).finally(
            () => {
                settled = true;
            },
        );
        await vi.advanceTimersByTimeAsync(100);

        expect(onTimeout).toHaveBeenCalledOnce();
        expect(Sentry.captureException).toHaveBeenCalledOnce();
        expect(settled).toBe(false);

        finishWork();
        await guarded;
        expect(settled).toBe(true);
    });
});
