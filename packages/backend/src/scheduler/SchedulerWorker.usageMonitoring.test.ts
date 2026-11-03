import { SCHEDULER_TASKS } from '@lightdash/common';
import { UsageEventsCompactor } from '../analytics/eventStream/UsageEventsCompactor';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import Logger from '../logging/logger';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';

vi.mock('../analytics/eventStream/UsageEventsCompactor', () => ({
    UsageEventsCompactor: vi.fn(),
}));

class UsageTestWorker extends SchedulerWorker {
    getCronTasks() {
        return this.getEnabledCronItems();
    }

    getUsageTask() {
        return this.getTaskList()[SCHEDULER_TASKS.COMPACT_USAGE_EVENTS]!;
    }
}

describe('usage processing task scope', () => {
    it.each(['org-1', undefined])(
        'runs the existing pipeline with scope %s, preserving unscoped nightly jobs',
        async (organizationUuid) => {
            const run = vi.fn().mockResolvedValue({
                partitionsDiscovered: 0,
                partitionsCompacted: 0,
                partitionsFailed: 0,
                partitionsSkippedUnknownStream: 0,
                rawObjectsDeleted: 0,
            });
            vi.mocked(UsageEventsCompactor).mockImplementation(
                class MockUsageEventsCompactor {
                    run = run;
                } as unknown as typeof UsageEventsCompactor,
            );
            const scheduleAnalyticsContentReconciliation = vi.fn();
            const worker = new UsageTestWorker({
                schedulerClient: { scheduleAnalyticsContentReconciliation },
                lightdashConfig: {
                    ...lightdashConfigMock,
                    usageEvents: {
                        ...lightdashConfigMock.usageEvents,
                        enabled: true,
                        s3: { bucket: 'test' },
                    },
                },
            } as unknown as SchedulerWorkerArguments);
            await worker.getUsageTask()(
                { organizationUuid } as never,
                {} as never,
            );
            expect(run).toHaveBeenCalledWith(
                expect.any(Date),
                organizationUuid,
            );
            expect(
                scheduleAnalyticsContentReconciliation,
            ).toHaveBeenCalledExactlyOnceWith(organizationUuid ?? null);
        },
    );
});

describe('analytics content enqueue after usage processing', () => {
    afterEach(() => vi.restoreAllMocks());

    const createWorker = (
        run: () => Promise<unknown>,
        enqueue: () => Promise<void>,
    ) => {
        vi.mocked(UsageEventsCompactor).mockImplementation(
            class MockUsageEventsCompactor {
                run = run;
            } as unknown as typeof UsageEventsCompactor,
        );
        return new UsageTestWorker({
            lightdashConfig: {
                ...lightdashConfigMock,
                usageEvents: {
                    ...lightdashConfigMock.usageEvents,
                    enabled: true,
                    s3: { bucket: 'test' },
                },
            },
            schedulerClient: {
                scheduleAnalyticsContentReconciliation: enqueue,
            },
        } as unknown as SchedulerWorkerArguments);
    };

    it('queues content reconciliation only after the processing attempt finishes', async () => {
        let finish: (value: unknown) => void = () => {};
        const processing = new Promise((resolve) => {
            finish = resolve;
        });
        const enqueue = vi.fn().mockResolvedValue(undefined);
        const worker = createWorker(() => processing, enqueue);
        const result = worker.getUsageTask()(
            { organizationUuid: 'org-1' } as never,
            {} as never,
        );
        expect(enqueue).not.toHaveBeenCalled();
        finish({ partitionsFailed: 1 });
        await result;
        expect(enqueue).toHaveBeenCalledExactlyOnceWith('org-1');
    });

    it('still enqueues after a failed pipeline and preserves the original failure', async () => {
        const failure = new Error('dimension export failed');
        const enqueue = vi.fn().mockResolvedValue(undefined);
        const worker = createWorker(
            vi.fn().mockRejectedValue(failure),
            enqueue,
        );
        await expect(
            worker.getUsageTask()({} as never, {} as never),
        ).rejects.toBe(failure);
        expect(enqueue).toHaveBeenCalledExactlyOnceWith(null);
    });

    it.each([true, false])(
        'enqueue failure never changes the pipeline outcome (pipeline failed=%s)',
        async (pipelineFailed) => {
            const failure = new Error('pipeline failure');
            const run = pipelineFailed
                ? vi.fn().mockRejectedValue(failure)
                : vi.fn().mockResolvedValue({});
            const enqueue = vi
                .fn()
                .mockRejectedValue(new Error('queue unavailable'));
            const log = vi
                .spyOn(Logger, 'error')
                .mockImplementation(() => Logger);
            const result = createWorker(run, enqueue).getUsageTask()(
                { organizationUuid: 'org-1' } as never,
                {} as never,
            );
            if (pipelineFailed) await expect(result).rejects.toBe(failure);
            else await expect(result).resolves.toBeUndefined();
            expect(log).toHaveBeenCalledWith(
                'Failed to enqueue analytics content reconciliation',
                { organizationUuid: 'org-1' },
            );
            expect(run).toHaveBeenCalledTimes(1);
        },
    );

    it('keeps compaction cron in the processing pool without adding unrelated tasks', () => {
        const worker = new UsageTestWorker({
            lightdashConfig: {
                ...lightdashConfigMock,
                scheduler: {
                    ...lightdashConfigMock.scheduler,
                    tasks: [SCHEDULER_TASKS.COMPACT_USAGE_EVENTS],
                },
            },
        } as unknown as SchedulerWorkerArguments);
        expect(worker.getCronTasks()).toEqual([
            expect.objectContaining({
                task: SCHEDULER_TASKS.COMPACT_USAGE_EVENTS,
                pattern: '30 0 * * *',
            }),
        ]);
    });

    it('does not register compaction cron in a sync-only process', () => {
        const worker = new UsageTestWorker({
            lightdashConfig: {
                ...lightdashConfigMock,
                scheduler: {
                    ...lightdashConfigMock.scheduler,
                    tasks: [
                        SCHEDULER_TASKS.RECONCILE_ANALYTICS_CONTENT,
                        SCHEDULER_TASKS.SYNC_ANALYTICS_CONTENT,
                    ],
                },
            },
        } as unknown as SchedulerWorkerArguments);
        expect(worker.getCronTasks()).toEqual([]);
    });
});

describe('usage monitoring worker configuration', () => {
    it.each([
        { capture: true, storage: true, task: true, expected: true },
        { capture: false, storage: true, task: true, expected: false },
        { capture: true, storage: false, task: true, expected: false },
        { capture: true, storage: true, task: false, expected: false },
    ])(
        'publishes enabled=$expected before waiting for the queue ($capture/$storage/$task)',
        async ({ capture, storage, task, expected }) => {
            const setEnabled = vi.fn();
            const startupError = new Error('queue unavailable');
            const worker = new SchedulerWorker({
                lightdashConfig: {
                    ...lightdashConfigMock,
                    scheduler: {
                        ...lightdashConfigMock.scheduler,
                        tasks: task
                            ? [SCHEDULER_TASKS.COMPACT_USAGE_EVENTS]
                            : [],
                    },
                    usageEvents: {
                        ...lightdashConfigMock.usageEvents,
                        enabled: capture,
                        s3: storage ? { bucket: 'test' } : null,
                    },
                },
                schedulerClient: {
                    graphileUtils: Promise.reject(startupError),
                },
                prometheusMetrics: { usageProcessing: { setEnabled } },
            } as unknown as SchedulerWorkerArguments);
            await expect(worker.run()).rejects.toBe(startupError);
            expect(setEnabled).toHaveBeenCalledExactlyOnceWith(expected);
        },
    );
});
