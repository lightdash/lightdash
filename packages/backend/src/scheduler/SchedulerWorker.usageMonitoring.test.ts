import { SCHEDULER_TASKS } from '@lightdash/common';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';

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
