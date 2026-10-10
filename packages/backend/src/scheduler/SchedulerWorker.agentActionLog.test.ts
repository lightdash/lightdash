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
        .mockResolvedValue({ totalDeleted: 2, batchCount: 1 });
    const queryCleanup = vi
        .fn()
        .mockResolvedValue({ totalDeleted: 3, batchCount: 1 });
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
        asyncQueryService: {
            queryHistoryModel: { cleanupBatch: queryCleanup },
            cleanupPreAggregateDailyStats: vi.fn().mockResolvedValue(0),
        },
    } as unknown as SchedulerWorkerArguments);
    return {
        cleanupBatch,
        queryCleanup,
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

test('disabled query history cleanup also disables agent action cleanup', async () => {
    const { cleanupBatch, queryCleanup, run } = setup(false);
    await run();
    expect(queryCleanup).not.toHaveBeenCalled();
    expect(cleanupBatch).not.toHaveBeenCalled();
});

test('propagates ledger cleanup failures for retry', async () => {
    const { cleanupBatch, run } = setup(true);
    cleanupBatch.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(run()).rejects.toThrow('cleanup failed');
});
