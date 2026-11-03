import { SCHEDULER_TASKS } from '@lightdash/common';
import { UsageEventsCompactor } from '../analytics/eventStream/UsageEventsCompactor';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';

vi.mock('../analytics/eventStream/UsageEventsCompactor', () => ({
    UsageEventsCompactor: vi.fn(),
}));

class UsageTestWorker extends SchedulerWorker {
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
            const worker = new UsageTestWorker({
                schedulerClient: {
                    scheduleUsageEventHistory,
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
            const worker = new UsageTestWorker({
                lightdashConfig: {
                    ...lightdashConfigMock,
                    usageEvents: { enabled: true, s3: { bucket: 'test' } },
                },
                schedulerClient: {
                    scheduleUsageEventHistory,
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
        },
    );
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
