import { ALL_TASK_NAMES } from '@lightdash/common';
import { run as runGraphileWorker, type Runner } from 'graphile-worker';
import { type LightdashConfig } from '../config/parseConfig';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';
import { SchedulerWorkerHealth } from './SchedulerWorkerHealth';

vi.mock('graphile-worker', async (importOriginal) => {
    const actual = await importOriginal<typeof import('graphile-worker')>();
    return {
        ...actual,
        run: vi.fn(),
    };
});

class TestableSchedulerWorker extends SchedulerWorker {
    public exposeTaskList() {
        return this.getTaskList();
    }

    public exposeFullTaskList() {
        return this.getFullTaskList();
    }

    public async pingPgOnceExposed(health: SchedulerWorkerHealth) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (this as any).pingPgOnce(health);
    }
}

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

const makeWorkerArgs = (
    withPgClient: import('vitest').Mock,
    workerHealth?: SchedulerWorkerHealth,
): SchedulerWorkerArguments => {
    const graphileUtils = Promise.resolve({
        addJob: vi.fn(),
        withPgClient,
    });
    return {
        lightdashConfig: makeConfig(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schedulerClient: { graphileUtils } as any,
        workerHealth,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as unknown as SchedulerWorkerArguments;
};

describe('SchedulerWorker — task list no longer carries heartbeat plumbing', () => {
    it('does not register any workerHeartbeat:* task even when workerHealth is provided', () => {
        // pg-ping runs out-of-band on a setInterval, so the queue should be
        // free of dynamic per-pool heartbeat task names regardless of health
        // wiring. This guards against accidental re-introduction of the
        // graphile-routed heartbeat path.
        const health = new SchedulerWorkerHealth('pod-abc-123');
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(vi.fn(), health),
        );

        const taskNames = Object.keys(worker.exposeTaskList());
        const heartbeatNames = taskNames.filter((n) =>
            n.startsWith('workerHeartbeat:'),
        );
        expect(heartbeatNames).toEqual([]);
        // Likewise no static workerHeartbeat / cleanWorkerHeartbeats handlers.
        expect(taskNames).not.toContain('workerHeartbeat');
        expect(taskNames).not.toContain('cleanWorkerHeartbeats');
    });

    it('does not register any heartbeat tasks when workerHealth is omitted', () => {
        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(vi.fn(), undefined),
        );

        const taskNames = Object.keys(worker.exposeTaskList());
        expect(
            taskNames.filter((n) => n.startsWith('workerHeartbeat')),
        ).toEqual([]);
        expect(taskNames).not.toContain('cleanWorkerHeartbeats');
    });
});

describe('SchedulerWorker — pingPgOnce', () => {
    it('sends the jobs:insert NOTIFY heartbeat through withPgClient and marks pg reachable on success', async () => {
        // The NOTIFY doubles as a pool liveness probe: it makes this process's
        // own LISTEN client nudge the worker pool, so a terminated pool
        // surfaces "nudge called after worker terminated" via
        // pool:listen:error and trips the poolDead latch — even on an idle
        // instance where nothing else generates NOTIFYs.
        const health = new SchedulerWorkerHealth('pod-xyz');
        const markPgReachableSpy = vi.spyOn(health, 'markPgReachable');

        const pgClient = {
            query: vi.fn().mockResolvedValue({ rows: [{ pg_notify: '' }] }),
        };
        const withPgClient = vi
            .fn()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .mockImplementation(async (fn: any) => fn(pgClient));

        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(withPgClient, health),
        );

        await worker.pingPgOnceExposed(health);

        expect(withPgClient).toHaveBeenCalledTimes(1);
        expect(pgClient.query).toHaveBeenCalledWith(
            `SELECT pg_notify('jobs:insert', '')`,
        );
        expect(markPgReachableSpy).toHaveBeenCalledTimes(1);
    });

    it('does NOT mark pg reachable when the query rejects', async () => {
        const health = new SchedulerWorkerHealth('pod-down');
        const markPgReachableSpy = vi.spyOn(health, 'markPgReachable');

        const withPgClient = vi
            .fn()
            .mockRejectedValue(new Error('connection refused'));

        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(withPgClient, health),
        );

        await worker.pingPgOnceExposed(health);

        expect(withPgClient).toHaveBeenCalledTimes(1);
        expect(markPgReachableSpy).not.toHaveBeenCalled();
    });

    it('continues running after a failure (no exception escapes the ping)', async () => {
        const health = new SchedulerWorkerHealth('pod-flapping');
        const pgClient = {
            query: vi
                .fn()
                .mockRejectedValueOnce(new Error('pg blip'))
                .mockResolvedValueOnce({ rows: [] }),
        };
        const withPgClient = vi
            .fn()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .mockImplementation(async (fn: any) => fn(pgClient));

        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(withPgClient, health),
        );

        await expect(worker.pingPgOnceExposed(health)).resolves.toBeUndefined();
        await expect(worker.pingPgOnceExposed(health)).resolves.toBeUndefined();
        expect(pgClient.query).toHaveBeenCalledTimes(2);
    });

    it('does not hang when withPgClient never resolves (wedged backend)', async () => {
        vi.useFakeTimers();
        try {
            const health = new SchedulerWorkerHealth('pod-wedged');
            const markPgReachableSpy = vi.spyOn(health, 'markPgReachable');
            const withPgClient = vi.fn().mockImplementation(
                () =>
                    new Promise(() => {
                        // intentionally pending forever
                    }),
            );

            const worker = new TestableSchedulerWorker(
                makeWorkerArgs(withPgClient, health),
            );

            const ping = worker.pingPgOnceExposed(health);

            // Advance past the 5s ping timeout.
            await vi.advanceTimersByTimeAsync(6_000);

            await expect(ping).resolves.toBeUndefined();
            expect(withPgClient).toHaveBeenCalledTimes(1);
            // Timeout path must NOT mark reachable — that's the whole point.
            expect(markPgReachableSpy).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('SchedulerWorker — runner promise settlement', () => {
    const makeFakeRunner = () => {
        let settle!: () => void;
        const promise = new Promise<void>((resolve) => {
            settle = resolve;
        });
        const runner = {
            promise,
            stop: vi.fn(async () => {
                settle();
            }),
            addJob: vi.fn(),
        } as unknown as Runner;
        return { runner, settle };
    };

    const flushSettlement = async () => {
        // The .finally continuation registered in run() executes on the
        // microtask queue after the runner promise settles.
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
    };

    beforeEach(() => {
        vi.mocked(runGraphileWorker).mockReset();
    });

    it('latches poolDead when the runner promise settles outside a graceful stop', async () => {
        // graphile-worker 0.13 gives up permanently after e.g. 10 consecutive
        // failed job acquisitions (Postgres restart). When its promise
        // settles without stop() having been called, the pool is dead.
        const health = new SchedulerWorkerHealth('pod-crash');
        const markPoolDeadSpy = vi.spyOn(health, 'markPoolDead');
        const { runner, settle } = makeFakeRunner();
        vi.mocked(runGraphileWorker).mockResolvedValue(runner);

        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(vi.fn().mockResolvedValue({ rows: [] }), health),
        );
        await worker.run();
        expect(worker.isRunning).toBe(true);

        settle();
        await flushSettlement();

        expect(worker.isRunning).toBe(false);
        expect(markPoolDeadSpy).toHaveBeenCalledWith(
            'graphile runner stopped unexpectedly',
        );
        expect(health.isHealthy(Date.now() + 1).ok).toBe(false);
    });

    it('does not latch poolDead when stop() settles the promise gracefully', async () => {
        const health = new SchedulerWorkerHealth('pod-graceful');
        const markPoolDeadSpy = vi.spyOn(health, 'markPoolDead');
        const { runner } = makeFakeRunner();
        vi.mocked(runGraphileWorker).mockResolvedValue(runner);

        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(vi.fn().mockResolvedValue({ rows: [] }), health),
        );
        await worker.run();

        await worker.stop();
        await flushSettlement();

        expect(worker.isRunning).toBe(false);
        expect(runner.stop).toHaveBeenCalledTimes(1);
        expect(markPoolDeadSpy).not.toHaveBeenCalled();
    });
});
