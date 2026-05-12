import { ALL_TASK_NAMES } from '@lightdash/common';
import { type LightdashConfig } from '../config/parseConfig';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';
import { SchedulerWorkerHealth } from './SchedulerWorkerHealth';

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
    withPgClient: jest.Mock,
    workerHealth?: SchedulerWorkerHealth,
): SchedulerWorkerArguments => {
    const graphileUtils = Promise.resolve({
        addJob: jest.fn(),
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
            makeWorkerArgs(jest.fn(), health),
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
            makeWorkerArgs(jest.fn(), undefined),
        );

        const taskNames = Object.keys(worker.exposeTaskList());
        expect(
            taskNames.filter((n) => n.startsWith('workerHeartbeat')),
        ).toEqual([]);
        expect(taskNames).not.toContain('cleanWorkerHeartbeats');
    });
});

describe('SchedulerWorker — pingPgOnce', () => {
    it('runs SELECT 1 through withPgClient and marks pg reachable on success', async () => {
        const health = new SchedulerWorkerHealth('pod-xyz');
        const markPgReachableSpy = jest.spyOn(health, 'markPgReachable');

        const pgClient = {
            query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
        };
        const withPgClient = jest
            .fn()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .mockImplementation(async (fn: any) => fn(pgClient));

        const worker = new TestableSchedulerWorker(
            makeWorkerArgs(withPgClient, health),
        );

        await worker.pingPgOnceExposed(health);

        expect(withPgClient).toHaveBeenCalledTimes(1);
        expect(pgClient.query).toHaveBeenCalledWith('SELECT 1');
        expect(markPgReachableSpy).toHaveBeenCalledTimes(1);
    });

    it('does NOT mark pg reachable when the query rejects', async () => {
        const health = new SchedulerWorkerHealth('pod-down');
        const markPgReachableSpy = jest.spyOn(health, 'markPgReachable');

        const withPgClient = jest
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
            query: jest
                .fn()
                .mockRejectedValueOnce(new Error('pg blip'))
                .mockResolvedValueOnce({ rows: [] }),
        };
        const withPgClient = jest
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
        jest.useFakeTimers();
        try {
            const health = new SchedulerWorkerHealth('pod-wedged');
            const markPgReachableSpy = jest.spyOn(health, 'markPgReachable');
            const withPgClient = jest.fn().mockImplementation(
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
            await jest.advanceTimersByTimeAsync(6_000);

            await expect(ping).resolves.toBeUndefined();
            expect(withPgClient).toHaveBeenCalledTimes(1);
            // Timeout path must NOT mark reachable — that's the whole point.
            expect(markPgReachableSpy).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });
});
