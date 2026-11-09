import { ALL_TASK_NAMES, SCHEDULER_TASKS } from '@lightdash/common';
import { type LightdashConfig } from '../config/parseConfig';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';

class TestableSchedulerWorker extends SchedulerWorker {
    public exposeFullTaskList() {
        return this.getFullTaskList();
    }
}

const makeWorkerArgs = (
    deleteExpired: import('vitest').Mock,
    deleteExpiredSignInCodes: import('vitest').Mock = vi.fn(async () => 0),
): SchedulerWorkerArguments =>
    ({
        lightdashConfig: {
            scheduler: {
                tasks: [...ALL_TASK_NAMES],
                concurrency: 1,
                pollInterval: 1000,
                jobTimeout: 60_000,
                quiesce: {
                    pollInterval: 2_000,
                    gracePeriod: 180_000,
                    resumeJitter: 60_000,
                    resumeRampPeriod: 180_000,
                },
                queryHistory: {
                    cleanup: {
                        enabled: false,
                        schedule: '0 0 * * *',
                        retentionDays: 30,
                        batchSize: 100,
                        delayMs: 0,
                        maxBatches: 1,
                    },
                },
            },
            database: { connectionUri: 'postgres://noop' },
        } as unknown as LightdashConfig,
        mobileAppLinkModel: { deleteExpired },
        mobileSignInCodeModel: { deleteExpired: deleteExpiredSignInCodes },
    }) as unknown as SchedulerWorkerArguments;

describe('SchedulerWorker — mobile app links cleanup', () => {
    it('registers a cleanup task that purges expired links and counters', async () => {
        const deleteExpired = vi.fn(async () => ({
            links: 2,
            rateCounters: 5,
        }));
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(deleteExpired),
        );

        const task =
            worker.exposeFullTaskList()[SCHEDULER_TASKS.CLEAN_MOBILE_APP_LINKS];
        expect(task).toBeDefined();

        await task({} as never, {} as never);
        expect(deleteExpired).toHaveBeenCalledOnce();
    });

    it('purges expired mobile sign-in codes in the same task', async () => {
        const deleteExpiredSignInCodes = vi.fn(async () => 3);
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(
                vi.fn(async () => ({ links: 0, rateCounters: 0 })),
                deleteExpiredSignInCodes,
            ),
        );

        await worker
            .exposeFullTaskList()
            [SCHEDULER_TASKS.CLEAN_MOBILE_APP_LINKS]({} as never, {} as never);
        expect(deleteExpiredSignInCodes).toHaveBeenCalledOnce();
    });
});
