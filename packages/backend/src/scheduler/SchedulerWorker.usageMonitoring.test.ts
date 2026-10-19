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
            });
            vi.mocked(UsageEventsCompactor).mockImplementation(
                class MockUsageEventsCompactor {
                    run = run;
                } as unknown as typeof UsageEventsCompactor,
            );
            const worker = new UsageTestWorker({
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
