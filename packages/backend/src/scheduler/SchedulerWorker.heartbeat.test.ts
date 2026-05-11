import { ALL_TASK_NAMES, SCHEDULER_TASKS } from '@lightdash/common';
import { type LightdashConfig } from '../config/parseConfig';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';
import { SchedulerWorkerHealth } from './SchedulerWorkerHealth';

// A subclass exposing the protected getTaskList for assertion purposes.
class TestableSchedulerWorker extends SchedulerWorker {
    public exposeTaskList() {
        return this.getTaskList();
    }

    public exposeFullTaskList() {
        return this.getFullTaskList();
    }

    public async enqueueHeartbeatOnce(health: SchedulerWorkerHealth) {
        // The real interval is started in run(); we call the underlying enqueue
        // directly so tests don't have to spin up graphile.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (this as any).enqueueOwnHeartbeat(health);
    }
}

// Minimal lightdash config covering the bits SchedulerTask + SchedulerWorker
// touch in their constructors. Cast to LightdashConfig — instantiating the
// full config object would pull in dozens of services we don't need here.
const makeConfig = (): LightdashConfig =>
    ({
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
    }) as unknown as LightdashConfig;

// Build a minimal args bag. All services are stubs because the heartbeat
// path only depends on schedulerClient.graphileUtils.
const makeWorkerArgs = (
    addJobSpy: jest.Mock,
    workerHealth?: SchedulerWorkerHealth,
    withPgClient?: jest.Mock,
): SchedulerWorkerArguments => {
    const graphileUtils = Promise.resolve({
        addJob: addJobSpy,
        withPgClient: withPgClient ?? jest.fn(),
    });
    return {
        lightdashConfig: makeConfig(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schedulerClient: { graphileUtils } as any,
        workerHealth,
        // The remaining service slots are not touched by getTaskList or
        // enqueueOwnHeartbeat. Cast through unknown to avoid stubbing 20+
        // dependencies that the tests under this file never call.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as unknown as SchedulerWorkerArguments;
};

describe('SchedulerWorker — per-pool heartbeat registration', () => {
    it('registers a workerHeartbeat:<poolId> task only when workerHealth is provided', () => {
        const health = new SchedulerWorkerHealth('pod-abc-123');
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(jest.fn(), health),
        );

        const tasks = worker.exposeTaskList();
        const taskNames = Object.keys(tasks);

        expect(taskNames).toContain('workerHeartbeat:pod-abc-123');
        // No leakage of any other workerHeartbeat:* names from this pool.
        const heartbeatNames = taskNames.filter((n) =>
            n.startsWith('workerHeartbeat:'),
        );
        expect(heartbeatNames).toEqual(['workerHeartbeat:pod-abc-123']);
    });

    it('does NOT register any workerHeartbeat:* task when workerHealth is omitted', () => {
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(jest.fn(), undefined),
        );

        const tasks = worker.exposeTaskList();
        const heartbeatNames = Object.keys(tasks).filter((n) =>
            n.startsWith('workerHeartbeat:'),
        );

        expect(heartbeatNames).toEqual([]);
    });

    it('isolates two pools running in the same process with different poolIds', () => {
        // This is the multi-replica / dual-pool scenario: two workers running
        // side by side must each register a UNIQUE task name so that neither
        // pool can steal the other's heartbeat job.
        const healthA = new SchedulerWorkerHealth('pod-a');
        const healthB = new SchedulerWorkerHealth('pod-b');
        const workerA = new TestableSchedulerWorker(
            makeWorkerArgs(jest.fn(), healthA),
        );
        const workerB = new TestableSchedulerWorker(
            makeWorkerArgs(jest.fn(), healthB),
        );

        const namesA = Object.keys(workerA.exposeTaskList()).filter((n) =>
            n.startsWith('workerHeartbeat:'),
        );
        const namesB = Object.keys(workerB.exposeTaskList()).filter((n) =>
            n.startsWith('workerHeartbeat:'),
        );

        expect(namesA).toEqual(['workerHeartbeat:pod-a']);
        expect(namesB).toEqual(['workerHeartbeat:pod-b']);
        expect(namesA[0]).not.toEqual(namesB[0]);
    });
});

describe('SchedulerWorker — enqueueOwnHeartbeat', () => {
    it('enqueues the per-pool task name with poolId payload and matching jobKey', async () => {
        const health = new SchedulerWorkerHealth('pod-xyz');
        const addJob = jest.fn().mockResolvedValue(undefined);
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(addJob, health),
        );

        await worker.enqueueHeartbeatOnce(health);

        expect(addJob).toHaveBeenCalledTimes(1);
        const [taskName, payload, options] = addJob.mock.calls[0];
        expect(taskName).toBe('workerHeartbeat:pod-xyz');
        expect(payload).toEqual({
            poolId: 'pod-xyz',
            enqueuedAt: expect.stringMatching(
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
            ),
        });
        expect(options).toMatchObject({
            jobKey: 'workerHeartbeat:pod-xyz',
            // Explicit replace mode — collapses pending unlocked rows so a
            // stuck pool can never leave more than one queued heartbeat.
            jobKeyMode: 'replace',
            maxAttempts: 1,
        });
    });

    it('continues attempting heartbeats after a failed enqueue', async () => {
        const health = new SchedulerWorkerHealth('pod-failing');
        const addJob = jest
            .fn()
            .mockRejectedValueOnce(new Error('pg wedged'))
            .mockResolvedValueOnce(undefined);
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(addJob, health),
        );

        await worker.enqueueHeartbeatOnce(health);
        await worker.enqueueHeartbeatOnce(health);

        // The second tick still ran — the first failure did not block subsequent enqueues.
        expect(addJob).toHaveBeenCalledTimes(2);
    });

    it('does not hang forever when addJob never resolves (wedged pg)', async () => {
        jest.useFakeTimers();
        try {
            const health = new SchedulerWorkerHealth('pod-hung');
            // Simulate a wedged pg backend: addJob returns a promise that
            // never resolves or rejects.
            const addJob = jest.fn().mockImplementation(
                () =>
                    new Promise(() => {
                        // intentionally pending forever
                    }),
            );
            const worker = new TestableSchedulerWorker(
                makeWorkerArgs(addJob, health),
            );

            const enqueuePromise = worker.enqueueHeartbeatOnce(health);

            // Advance past the 10s timeout cap.
            await jest.advanceTimersByTimeAsync(11_000);

            // The enqueue method must resolve (catch swallows the timeout
            // error). Without the timeout cap this test would hang.
            await expect(enqueuePromise).resolves.toBeUndefined();
            expect(addJob).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('SchedulerWorker — cleanWorkerHeartbeats', () => {
    it('deletes orphan rows older than 10 minutes, including stale-locked ones', async () => {
        const pgClient = {
            query: jest.fn().mockResolvedValue({ rows: [{ count: '5' }] }),
        };
        const withPgClient = jest
            .fn()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .mockImplementation(async (fn: any) => fn(pgClient));
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(jest.fn(), undefined, withPgClient),
        );

        const tasks = worker.exposeFullTaskList();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handler = tasks[SCHEDULER_TASKS.CLEAN_WORKER_HEARTBEATS] as any;
        expect(handler).toBeDefined();

        await handler({}, {});

        expect(withPgClient).toHaveBeenCalledTimes(1);
        const sql = pgClient.query.mock.calls[0][0] as string;
        expect(sql).toMatch(/DELETE FROM graphile_worker\.jobs/);
        expect(sql).toMatch(/task_identifier LIKE 'workerHeartbeat:%'/);
        // Both gating conditions present: run_at staleness AND lock state.
        expect(sql).toMatch(/run_at < NOW\(\) - INTERVAL '10 minutes'/);
        // Crucially, stale locks count as orphaned — otherwise a pod that died
        // mid-heartbeat would leave its row stuck for graphile's much longer
        // jobTimeout window before this cron could touch it.
        expect(sql).toMatch(
            /locked_at IS NULL OR locked_at < NOW\(\) - INTERVAL '10 minutes'/,
        );
    });

    it('rethrows on DB failure so graphile retries the cron run', async () => {
        const withPgClient = jest.fn().mockRejectedValue(new Error('db down'));
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(jest.fn(), undefined, withPgClient),
        );

        const tasks = worker.exposeFullTaskList();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handler = tasks[SCHEDULER_TASKS.CLEAN_WORKER_HEARTBEATS] as any;
        await expect(handler({}, {})).rejects.toThrow('db down');
    });
});
