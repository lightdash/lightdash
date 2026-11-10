import { ALL_TASK_NAMES, SCHEDULER_TASKS } from '@lightdash/common';
import Logger from '../logging/logger';
import {
    approvalRequestCleanupWorker,
    runApprovalRequestCleanup,
} from '../testing/agentApprovalRequestCleanup.mock';

beforeEach(() => {
    vi.spyOn(Logger, 'info').mockImplementation(() => Logger);
    vi.spyOn(Logger, 'error').mockImplementation(() => Logger);
});

afterEach(() => vi.restoreAllMocks());

test('registers the hourly cleanup in the cron and enabled task lists', async () => {
    const deleteExpiredBatch = vi.fn().mockResolvedValue(0);
    const worker = approvalRequestCleanupWorker({ deleteExpiredBatch });
    expect(SCHEDULER_TASKS.CLEAN_AGENT_CONNECTION_APPROVAL_REQUESTS).toBe(
        'cleanAgentConnectionApprovalRequests',
    );
    expect(ALL_TASK_NAMES).toContain(
        SCHEDULER_TASKS.CLEAN_AGENT_CONNECTION_APPROVAL_REQUESTS,
    );
    expect(worker.cronItems()).toContainEqual({
        task: SCHEDULER_TASKS.CLEAN_AGENT_CONNECTION_APPROVAL_REQUESTS,
        pattern: '53 * * * *',
        options: { backfillPeriod: 2 * 3600 * 1000, maxAttempts: 3 },
    });
    await runApprovalRequestCleanup(worker);
    expect(deleteExpiredBatch).toHaveBeenCalledExactlyOnceWith(1000);
    expect(Logger.info).toHaveBeenCalledExactlyOnceWith(
        'Agent connection approval requests cleanup completed. Deleted: 0. Batches: 1. Batch cap hit: false',
    );
});

test('logs only counts and cap status after a multi-batch run', async () => {
    const deleteExpiredBatch = vi
        .fn()
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(500);
    await runApprovalRequestCleanup(
        approvalRequestCleanupWorker({ deleteExpiredBatch }),
    );
    expect(deleteExpiredBatch.mock.calls).toEqual([[1000], [1000], [1000]]);
    expect(Logger.info).toHaveBeenCalledExactlyOnceWith(
        'Agent connection approval requests cleanup completed. Deleted: 2500. Batches: 3. Batch cap hit: false',
    );
    expect(Logger.error).not.toHaveBeenCalled();
});

test('stops after fifty full batches by default', async () => {
    const deleteExpiredBatch = vi.fn().mockResolvedValue(1000);
    await runApprovalRequestCleanup(
        approvalRequestCleanupWorker({ deleteExpiredBatch }),
    );
    expect(deleteExpiredBatch).toHaveBeenCalledTimes(50);
    expect(Logger.info).toHaveBeenCalledExactlyOnceWith(
        'Agent connection approval requests cleanup completed. Deleted: 50000. Batches: 50. Batch cap hit: true',
    );
});

test.each([0, -1, 1.5, NaN, Infinity, 51])(
    'rejects an invalid batch cap of %s',
    (maxBatches) => {
        expect(() =>
            approvalRequestCleanupWorker(
                { deleteExpiredBatch: vi.fn() },
                maxBatches,
            ),
        ).toThrow(
            'Approval request cleanup batch cap must be between 1 and 50',
        );
    },
);

test('rethrows the same error without logging its sensitive contents', async () => {
    const error = new Error(
        'request-id redirect-uri state nonce-digest row-content',
    );
    const deleteExpiredBatch = vi
        .fn()
        .mockResolvedValueOnce(1000)
        .mockRejectedValueOnce(error);
    await expect(
        runApprovalRequestCleanup(
            approvalRequestCleanupWorker({ deleteExpiredBatch }),
        ),
    ).rejects.toBe(error);
    expect(Logger.info).not.toHaveBeenCalled();
    expect(Logger.error).toHaveBeenCalledExactlyOnceWith(
        'Agent connection approval requests cleanup failed. Deleted: 1000. Batches: 1. Batch cap hit: false',
    );
});

// A worker that cannot run the task must not schedule it, or the jobs pile up unclaimed.
test('does not schedule the cleanup on a worker whose task list leaves it out', () => {
    const model = { deleteExpiredBatch: vi.fn() };
    const without = approvalRequestCleanupWorker(
        model,
        undefined,
        ALL_TASK_NAMES.filter(
            (name) =>
                name !==
                SCHEDULER_TASKS.CLEAN_AGENT_CONNECTION_APPROVAL_REQUESTS,
        ),
    );
    expect(
        without
            .cronItems()
            .some(
                (item) =>
                    item.task ===
                    SCHEDULER_TASKS.CLEAN_AGENT_CONNECTION_APPROVAL_REQUESTS,
            ),
    ).toBe(false);
    const withTask = approvalRequestCleanupWorker(model);
    expect(
        withTask
            .cronItems()
            .filter(
                (item) =>
                    item.task ===
                    SCHEDULER_TASKS.CLEAN_AGENT_CONNECTION_APPROVAL_REQUESTS,
            ),
    ).toHaveLength(1);
    expect(without.cronItems().length).toBe(withTask.cronItems().length - 1);
});
