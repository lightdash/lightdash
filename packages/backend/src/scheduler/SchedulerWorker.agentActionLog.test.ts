import { ALL_TASK_NAMES, SCHEDULER_TASKS } from '@lightdash/common';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';

class TestableSchedulerWorker extends SchedulerWorker {
    public task() {
        return this.getFullTaskList()[SCHEDULER_TASKS.CLEAN_QUERY_HISTORY];
    }
}

const setup = (enabled: boolean) => {
    const cleanupBatch = vi
        .fn()
        .mockResolvedValue({ totalDeleted: 2, batchCount: 1, completed: true });
    const queryCleanup = vi
        .fn()
        .mockResolvedValue({ totalDeleted: 3, batchCount: 1, completed: true });
    const countOlderThan = vi.fn().mockResolvedValue(0);
    const cleanupApiSourceCalls = vi
        .fn()
        .mockResolvedValue({ totalDeleted: 4, batchCount: 1, completed: true });
    const worker = new TestableSchedulerWorker({
        lightdashConfig: {
            scheduler: {
                tasks: [...ALL_TASK_NAMES],
                queryHistory: {
                    cleanup: {
                        enabled,
                        retentionDays: 30,
                        batchSize: 100,
                        delayMs: 0,
                        maxBatches: 2,
                    },
                },
            },
        },
        agentActionLogModel: { cleanupBatch },
        apiSourceCallLog: { cleanupApiSourceCalls },
        asyncQueryService: {
            queryHistoryModel: {
                cleanupBatch: queryCleanup,
                countOlderThan,
            },
            cleanupPreAggregateDailyStats: vi.fn().mockResolvedValue(0),
        },
    } as unknown as SchedulerWorkerArguments);
    return {
        cleanupBatch,
        queryCleanup,
        countOlderThan,
        cleanupApiSourceCalls,
        run: () =>
            worker.task()(
                {
                    organizationUuid: 'org',
                    projectUuid: 'project',
                    userUuid: 'user',
                },
                {} as never,
            ),
    };
};

test('cleans agent actions with the query history retention settings', async () => {
    const { cleanupBatch, queryCleanup, run } = setup(true);
    await run();
    expect(queryCleanup).toHaveBeenCalledOnce();
    expect(cleanupBatch).toHaveBeenCalledExactlyOnceWith(
        ...queryCleanup.mock.calls[0],
    );
});

test('cleans the live data source call log with the same retention settings', async () => {
    const { cleanupApiSourceCalls, queryCleanup, run } = setup(true);
    await run();
    expect(cleanupApiSourceCalls).toHaveBeenCalledExactlyOnceWith(
        ...queryCleanup.mock.calls[0],
    );
});

test('disabled query history cleanup also disables agent action and call log cleanup', async () => {
    const { cleanupBatch, cleanupApiSourceCalls, queryCleanup, run } =
        setup(false);
    await run();
    expect(queryCleanup).not.toHaveBeenCalled();
    expect(cleanupBatch).not.toHaveBeenCalled();
    expect(cleanupApiSourceCalls).not.toHaveBeenCalled();
});

test('propagates ledger cleanup failures for retry', async () => {
    const { cleanupBatch, run } = setup(true);
    cleanupBatch.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(run()).rejects.toThrow('cleanup failed');
});

test('reports the remaining backlog only when the run stopped before clearing it', async () => {
    const { queryCleanup, countOlderThan, run } = setup(true);
    await run();
    expect(countOlderThan).not.toHaveBeenCalled();

    queryCleanup.mockResolvedValueOnce({
        totalDeleted: 200,
        batchCount: 2,
        completed: false,
    });
    countOlderThan.mockResolvedValueOnce(690_000);
    await run();
    expect(countOlderThan).toHaveBeenCalledExactlyOnceWith(
        queryCleanup.mock.calls[1][0],
    );
});
