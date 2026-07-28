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

const emptyPayload = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    userUuid: 'user-uuid',
};

const makeWorkerArgs = (
    deleteExpired: import('vitest').Mock,
): SchedulerWorkerArguments =>
    ({
        lightdashConfig: {
            scheduler: {
                tasks: [...ALL_TASK_NAMES],
                concurrency: 1,
                pollInterval: 1000,
                jobTimeout: 60_000,
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
        warehouseConnectCodeModel: { deleteExpired },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as unknown as SchedulerWorkerArguments;

describe('SchedulerWorker — warehouse connect codes cleanup', () => {
    it('registers a cleanup task that purges expired codes', async () => {
        const deleteExpired = vi.fn(async () => 3);
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(deleteExpired),
        );

        const task =
            worker.exposeFullTaskList()[
                SCHEDULER_TASKS.CLEAN_WAREHOUSE_CONNECT_CODES
            ];
        expect(task).toBeDefined();

        await task(emptyPayload, {} as never);
        expect(deleteExpired).toHaveBeenCalledOnce();
    });

    it('rethrows purge errors so the job is marked failed', async () => {
        const deleteExpired = vi.fn(async () => {
            throw new Error('db down');
        });
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(deleteExpired),
        );

        const task =
            worker.exposeFullTaskList()[
                SCHEDULER_TASKS.CLEAN_WAREHOUSE_CONNECT_CODES
            ];
        await expect(task(emptyPayload, {} as never)).rejects.toThrow(
            'db down',
        );
    });
});
