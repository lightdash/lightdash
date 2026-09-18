import { ALL_TASK_NAMES } from '@lightdash/common';
import {
    run as runGraphileWorker,
    type Runner,
    type WorkerPool,
} from 'graphile-worker';
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

const SHUTDOWN_TIMEOUT_MS = 1_000;

const makeConfig = (): LightdashConfig =>
    ({
        scheduler: {
            tasks: [...ALL_TASK_NAMES],
            concurrency: 3,
            pollInterval: 1_000,
            jobTimeout: 60_000,
            shutdownTimeout: SHUTDOWN_TIMEOUT_MS,
            quiesce: {
                pollInterval: 10_000,
                gracePeriod: 10_000,
                resumeJitter: 100,
                resumeRampPeriod: 200,
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
        database: {
            connectionUri: 'postgres://noop',
            maxConnections: 10,
        },
    }) as unknown as LightdashConfig;

type FakeGraphileRunner = {
    runner: Runner;
    workerPool: WorkerPool;
    finishActiveJobs: () => void;
};

// runner.stop() resolves only once the active job finishes, mirroring
// graphile-worker's worker.release() promise; gracefulShutdown drops the
// workers so a pending stop resolves too.
const makeFakeGraphileRunner = (): FakeGraphileRunner => {
    let settle!: () => void;
    const promise = new Promise<void>((resolve) => {
        settle = resolve;
    });
    let finishActiveJobs!: () => void;
    const activeJobsDone = new Promise<void>((resolve) => {
        finishActiveJobs = resolve;
    });
    const workerPool = {
        release: vi.fn(async () => {
            settle();
        }),
        gracefulShutdown: vi.fn(async () => {
            settle();
            finishActiveJobs();
        }),
        promise,
    };
    const runner = {
        promise,
        stop: vi.fn(async () => {
            settle();
            await activeJobsDone;
        }),
        addJob: vi.fn(),
        events: undefined,
    } as unknown as Runner;
    return { runner, workerPool, finishActiveJobs };
};

const makeWorker = (workerHealth?: SchedulerWorkerHealth): SchedulerWorker => {
    const query = vi.fn(async () => ({ rows: [{ active: false }] }));
    const graphileUtils = Promise.resolve({
        addJob: vi.fn(),
        withPgClient: vi.fn(async (callback) => callback({ query } as never)),
    });

    return new SchedulerWorker({
        lightdashConfig: makeConfig(),
        schedulerClient: { graphileUtils },
        workerHealth,
    } as unknown as SchedulerWorkerArguments);
};

describe('SchedulerWorker ordinary shutdown', () => {
    const fakeRunners: FakeGraphileRunner[] = [];

    beforeEach(() => {
        vi.useFakeTimers();
        fakeRunners.length = 0;
        vi.mocked(runGraphileWorker).mockReset();
        vi.mocked(runGraphileWorker).mockImplementation(async (options) => {
            const fakeRunner = makeFakeGraphileRunner();
            fakeRunners.push(fakeRunner);
            options.events?.emit('pool:create', {
                workerPool: fakeRunner.workerPool,
            });
            return fakeRunner.runner;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('waits for in-flight jobs instead of releasing them for retry', async () => {
        const worker = makeWorker();
        await worker.run();
        const [fakeRunner] = fakeRunners;

        let stopped = false;
        const stopping = worker.stop().then(() => {
            stopped = true;
        });
        await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS - 1);
        expect(stopped).toBe(false);
        expect(fakeRunner?.runner.stop).toHaveBeenCalledOnce();

        fakeRunner?.finishActiveJobs();
        await stopping;

        expect(fakeRunner?.workerPool.gracefulShutdown).not.toHaveBeenCalled();
        expect(worker.isRunning).toBe(false);
    });

    it('releases still-active jobs for retry once the drain deadline passes', async () => {
        const worker = makeWorker();
        await worker.run();
        const [fakeRunner] = fakeRunners;

        const stopping = worker.stop();
        await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS);
        await stopping;

        expect(fakeRunner?.runner.stop).toHaveBeenCalledOnce();
        expect(
            fakeRunner?.workerPool.gracefulShutdown,
        ).toHaveBeenCalledExactlyOnceWith(
            'Scheduler shutdown deadline exceeded',
        );
    });

    it('skips the drain when the worker pool is already dead', async () => {
        const workerHealth = new SchedulerWorkerHealth();
        const worker = makeWorker(workerHealth);
        await worker.run();
        const [fakeRunner] = fakeRunners;
        workerHealth.markPoolDead('test');

        const stopping = worker.stop();
        await vi.advanceTimersByTimeAsync(1);
        await stopping;

        expect(
            fakeRunner?.workerPool.gracefulShutdown,
        ).toHaveBeenCalledExactlyOnceWith(
            'Scheduler worker stopping with dead pool',
        );
    });
});
