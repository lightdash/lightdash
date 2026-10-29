import { SCHEDULER_TASKS } from '@lightdash/common';
import { SchedulerService } from './SchedulerService';

const runningJob = (
    id: string,
    taskIdentifier: string,
    ageMinutes: number,
) => ({
    id,
    taskIdentifier,
    lockedAt: new Date(Date.now() - ageMinutes * 60_000),
    lockedBy: 'worker-test',
    runAt: new Date(),
    payload: {},
});

describe('long-running usage processing watchdog', () => {
    it('leaves usage processing to its lifecycle monitor without exempting other jobs', async () => {
        const schedulerClient = {
            getRecentRunningJobs: vi
                .fn()
                .mockResolvedValue([
                    runningJob(
                        'usage',
                        SCHEDULER_TASKS.COMPACT_USAGE_EVENTS,
                        180,
                    ),
                    runningJob('compile', SCHEDULER_TASKS.COMPILE_PROJECT, 90),
                ]),
            failJobs: vi.fn(),
        };
        const schedulerModel = { logSchedulerJob: vi.fn() };
        const jobModel = { update: vi.fn(), failRunningSteps: vi.fn() };
        const service = new SchedulerService({
            schedulerClient,
            schedulerModel,
            jobModel,
        } as unknown as ConstructorParameters<typeof SchedulerService>[0]);

        await expect(service.checkForStuckJobs()).resolves.toEqual({
            runningCount: 2,
            warningCount: 0,
            errorCount: 1,
        });
        expect(schedulerClient.failJobs).toHaveBeenCalledExactlyOnceWith([
            'compile',
        ]);
        expect(schedulerModel.logSchedulerJob).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ jobId: 'compile' }),
        );
    });
});
