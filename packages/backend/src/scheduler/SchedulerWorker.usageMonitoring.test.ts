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
    getCrons() {
        return this.getCronItems();
    }

    getHistoryTask() {
        return this.getTaskList()[
            SCHEDULER_TASKS.BACKFILL_USAGE_QUERY_HISTORY
        ]!;
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
                users: { limitReached: false, published: 0 },
            });
            vi.mocked(UsageEventsCompactor).mockImplementation(
                class MockUsageEventsCompactor {
                    run = run;
                } as unknown as typeof UsageEventsCompactor,
            );
            const scheduleUsageEventHistory = vi.fn();
            const retryFailedUsageEventHistory = vi.fn();
            const scheduleAnalyticsContentReconciliation = vi.fn();
            const worker = new UsageTestWorker({
                projectService: { isAnalyticsProjectEnabled: () => true },
                schedulerClient: {
                    scheduleUsageEventHistory,
                    retryFailedUsageEventHistory,
                    scheduleAnalyticsContentReconciliation,
                },
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
                false,
            );
            expect(scheduleUsageEventHistory).toHaveBeenCalledTimes(
                organizationUuid ? 1 : 0,
            );
            expect(retryFailedUsageEventHistory).toHaveBeenCalledTimes(
                organizationUuid ? 0 : 1,
            );
            expect(
                scheduleAnalyticsContentReconciliation,
            ).toHaveBeenCalledExactlyOnceWith(organizationUuid ?? null);
        },
    );
});

describe('usage event history continuation', () => {
    it.each([
        {
            includeHistory: false,
            deferred: 0,
            compacted: 0,
            published: 0,
            userLimit: false,
            enqueue: true,
        },
        {
            includeHistory: true,
            deferred: 1,
            compacted: 1,
            published: 0,
            userLimit: false,
            enqueue: true,
        },
        {
            includeHistory: true,
            deferred: 1,
            compacted: 0,
            published: 0,
            userLimit: false,
            enqueue: false,
        },
        {
            includeHistory: true,
            deferred: 0,
            compacted: 1,
            published: 0,
            userLimit: false,
            enqueue: false,
        },
        {
            includeHistory: true,
            deferred: 0,
            compacted: 0,
            published: 1,
            userLimit: true,
            enqueue: true,
        },
        {
            includeHistory: true,
            deferred: 0,
            compacted: 0,
            published: 0,
            userLimit: true,
            enqueue: false,
        },
    ])(
        'continues only after useful progress: %j',
        async ({
            includeHistory,
            deferred,
            compacted,
            published,
            userLimit,
            enqueue,
        }) => {
            const run = vi.fn().mockResolvedValue({
                partitionsDiscovered: compacted + deferred + 1,
                partitionsCompacted: compacted,
                partitionsDeferred: deferred,
                partitionsFailed: 1,
                users: { published, limitReached: userLimit },
            });
            vi.mocked(UsageEventsCompactor).mockImplementation(
                class MockUsageEventsCompactor {
                    run = run;
                } as unknown as typeof UsageEventsCompactor,
            );
            const scheduleUsageEventHistory = vi.fn();
            const scheduleAnalyticsContentReconciliation = vi.fn();
            const worker = new UsageTestWorker({
                projectService: { isAnalyticsProjectEnabled: () => true },
                lightdashConfig: {
                    ...lightdashConfigMock,
                    usageEvents: { enabled: true, s3: { bucket: 'test' } },
                },
                schedulerClient: {
                    scheduleUsageEventHistory,
                    scheduleAnalyticsContentReconciliation,
                },
            } as unknown as SchedulerWorkerArguments);
            await worker.getUsageTask()(
                { organizationUuid: 'org-1', includeHistory } as never,
                {} as never,
            );
            expect(run).toHaveBeenCalledWith(
                expect.any(Date),
                'org-1',
                includeHistory,
            );
            expect(scheduleUsageEventHistory).toHaveBeenCalledTimes(
                enqueue ? 1 : 0,
            );
            expect(
                scheduleAnalyticsContentReconciliation,
            ).toHaveBeenCalledExactlyOnceWith('org-1');
        },
    );
});

describe('analytics content enqueue failures', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each([true, false])(
        'preserves the compaction outcome when enqueue fails (pipeline failed=%s)',
        async (pipelineFailed) => {
            const failure = new Error('pipeline failed');
            const run = pipelineFailed
                ? vi.fn().mockRejectedValue(failure)
                : vi.fn().mockResolvedValue({
                      partitionsDeferred: 0,
                      users: { limitReached: false, published: 0 },
                  });
            vi.mocked(UsageEventsCompactor).mockImplementation(
                class MockUsageEventsCompactor {
                    run = run;
                } as unknown as typeof UsageEventsCompactor,
            );
            const enqueue = vi
                .fn()
                .mockRejectedValue(new Error('queue unavailable'));
            vi.spyOn(Logger, 'error').mockImplementation(() => Logger);
            const worker = new UsageTestWorker({
                projectService: { isAnalyticsProjectEnabled: () => true },
                lightdashConfig: {
                    ...lightdashConfigMock,
                    usageEvents: {
                        ...lightdashConfigMock.usageEvents,
                        enabled: true,
                        s3: { bucket: 'test' },
                    },
                },
                schedulerClient: {
                    scheduleUsageEventHistory: vi.fn(),
                    scheduleAnalyticsContentReconciliation: enqueue,
                },
            } as unknown as SchedulerWorkerArguments);
            const result = worker.getUsageTask()(
                { organizationUuid: 'org-1' } as never,
                {} as never,
            );
            if (pipelineFailed) await expect(result).rejects.toBe(failure);
            else await expect(result).resolves.toBeUndefined();
            expect(enqueue).toHaveBeenCalledExactlyOnceWith('org-1');
            expect(run).toHaveBeenCalledTimes(1);
        },
    );
});

it('still reconciles content when queuing the next history batch fails', async () => {
    const run = vi.fn().mockResolvedValue({
        partitionsCompacted: 1,
        partitionsDeferred: 1,
        users: { limitReached: false, published: 0 },
    });
    vi.mocked(UsageEventsCompactor).mockImplementation(
        class MockUsageEventsCompactor {
            run = run;
        } as unknown as typeof UsageEventsCompactor,
    );
    const failure = new Error('history queue unavailable');
    const scheduleUsageEventHistory = vi.fn().mockRejectedValue(failure);
    const scheduleAnalyticsContentReconciliation = vi.fn();
    const worker = new UsageTestWorker({
        projectService: { isAnalyticsProjectEnabled: () => true },
        lightdashConfig: {
            ...lightdashConfigMock,
            usageEvents: { enabled: true, s3: { bucket: 'test' } },
        },
        schedulerClient: {
            scheduleUsageEventHistory,
            scheduleAnalyticsContentReconciliation,
        },
    } as unknown as SchedulerWorkerArguments);
    await expect(
        worker.getUsageTask()(
            { organizationUuid: 'org-1', includeHistory: true } as never,
            {} as never,
        ),
    ).rejects.toBe(failure);
    expect(scheduleUsageEventHistory).toHaveBeenCalledExactlyOnceWith({
        organizationUuid: 'org-1',
        includeHistory: true,
    });
    expect(
        scheduleAnalyticsContentReconciliation,
    ).toHaveBeenCalledExactlyOnceWith('org-1');
});

describe('usage monitoring worker configuration', () => {
    it.each([
        {
            capture: true,
            storage: true,
            task: true,
            available: true,
            expected: true,
        },
        {
            capture: true,
            storage: true,
            task: true,
            available: false,
            expected: false,
        },
        { capture: false, storage: true, task: true, expected: false },
        { capture: true, storage: false, task: true, expected: false },
        { capture: true, storage: true, task: false, expected: false },
    ])(
        'publishes enabled=$expected before waiting for the queue ($capture/$storage/$task)',
        async ({ capture, storage, task, available = true, expected }) => {
            const setEnabled = vi.fn();
            const startupError = new Error('queue unavailable');
            const worker = new SchedulerWorker({
                projectService: { isAnalyticsProjectEnabled: () => available },
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

describe('disabled analytics processing', () => {
    it.each([true, false])(
        'does not start compaction or history when instance access is disabled (capture=%s)',
        async (capture) => {
            vi.clearAllMocks();
            const worker = new UsageTestWorker({
                lightdashConfig: {
                    ...lightdashConfigMock,
                    usageEvents: {
                        ...lightdashConfigMock.usageEvents,
                        enabled: capture,
                        s3: { bucket: 'test' },
                    },
                },
                projectService: { isAnalyticsProjectEnabled: () => false },
            } as unknown as SchedulerWorkerArguments);
            await worker.getUsageTask()({} as never, {} as never);
            expect(UsageEventsCompactor).not.toHaveBeenCalled();
            expect(
                worker
                    .getCrons()
                    .some(
                        (item) =>
                            item.task === SCHEDULER_TASKS.COMPACT_USAGE_EVENTS,
                    ),
            ).toBe(false);
            await expect(
                worker.getHistoryTask()(
                    { organizationUuid: 'org' } as never,
                    {} as never,
                ),
            ).rejects.toThrow(/not (enabled|configured)/);
        },
    );
});
