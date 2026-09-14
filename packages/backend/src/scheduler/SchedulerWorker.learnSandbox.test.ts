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
    deleteExpiredPreviewProjects: import('vitest').Mock,
    sweep: import('vitest').Mock,
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
        projectService: { deleteExpiredPreviewProjects },
        learnSandboxService: { sweep },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as unknown as SchedulerWorkerArguments;

describe('SchedulerWorker — CLEAN_EXPIRED_PREVIEWS learn sandbox sweep', () => {
    it('still deletes expired previews and does not rethrow when the sandbox sweep fails', async () => {
        const deleteExpiredPreviewProjects = vi.fn(async () => 2);
        const sweep = vi.fn(async () => {
            throw new Error('sweep exploded');
        });
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(deleteExpiredPreviewProjects, sweep),
        );

        const task =
            worker.exposeFullTaskList()[SCHEDULER_TASKS.CLEAN_EXPIRED_PREVIEWS];
        expect(task).toBeDefined();

        await expect(task(emptyPayload, {} as never)).resolves.not.toThrow();
        expect(deleteExpiredPreviewProjects).toHaveBeenCalledOnce();
        expect(sweep).toHaveBeenCalledOnce();
    });

    it('still runs the sandbox sweep when it succeeds', async () => {
        const deleteExpiredPreviewProjects = vi.fn(async () => 0);
        const sweep = vi.fn(async () => ({
            tokensDeleted: 1,
            workspacesRemoved: 2,
        }));
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(deleteExpiredPreviewProjects, sweep),
        );

        const task =
            worker.exposeFullTaskList()[SCHEDULER_TASKS.CLEAN_EXPIRED_PREVIEWS];
        await task(emptyPayload, {} as never);
        expect(sweep).toHaveBeenCalledOnce();
    });

    it('still rethrows (and skips the sweep) when preview deletion itself fails', async () => {
        const deleteExpiredPreviewProjects = vi.fn(async () => {
            throw new Error('deletion exploded');
        });
        const sweep = vi.fn(async () => ({
            tokensDeleted: 0,
            workspacesRemoved: 0,
        }));
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(deleteExpiredPreviewProjects, sweep),
        );

        const task =
            worker.exposeFullTaskList()[SCHEDULER_TASKS.CLEAN_EXPIRED_PREVIEWS];
        await expect(task(emptyPayload, {} as never)).rejects.toThrow(
            'deletion exploded',
        );
        expect(sweep).not.toHaveBeenCalled();
    });
});
