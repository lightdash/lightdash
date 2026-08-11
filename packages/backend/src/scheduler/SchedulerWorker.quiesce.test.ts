import { ALL_TASK_NAMES } from '@lightdash/common';
import {
    run as runGraphileWorker,
    type Runner,
    type RunnerOptions,
    type WorkerPool,
} from 'graphile-worker';
import { type LightdashConfig } from '../config/parseConfig';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';

vi.mock('graphile-worker', async (importOriginal) => {
    const actual = await importOriginal<typeof import('graphile-worker')>();
    return {
        ...actual,
        run: vi.fn(),
    };
});

type FakeGraphileRunner = {
    runner: Runner;
    workerPool: WorkerPool;
};

const makeConfig = (): LightdashConfig =>
    ({
        scheduler: {
            tasks: [...ALL_TASK_NAMES],
            concurrency: 3,
            pollInterval: 1_000,
            jobTimeout: 60_000,
            quiesce: {
                pollInterval: 10,
                gracePeriod: 100,
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

const makeWorker = (readActive: () => boolean): SchedulerWorker => {
    const query = vi.fn(async () => ({ rows: [{ active: readActive() }] }));
    const graphileUtils = Promise.resolve({
        addJob: vi.fn(),
        withPgClient: vi.fn(async (callback) => callback({ query } as never)),
    });

    return new SchedulerWorker({
        lightdashConfig: makeConfig(),
        schedulerClient: { graphileUtils },
    } as unknown as SchedulerWorkerArguments);
};

const makeFakeGraphileRunner = (): FakeGraphileRunner => {
    let settle!: () => void;
    const promise = new Promise<void>((resolve) => {
        settle = resolve;
    });
    const workerPool = {
        release: vi.fn(async () => {
            settle();
        }),
        gracefulShutdown: vi.fn(async () => {
            settle();
        }),
        promise,
    };
    const runner = {
        promise,
        stop: vi.fn(async () => {
            settle();
        }),
        addJob: vi.fn(),
        events: undefined,
    } as unknown as Runner;
    return { runner, workerPool };
};

describe('SchedulerWorker migration quiesce', () => {
    const fakeRunners: FakeGraphileRunner[] = [];
    const runnerOptions: RunnerOptions[] = [];

    beforeEach(() => {
        vi.useFakeTimers();
        fakeRunners.length = 0;
        runnerOptions.length = 0;
        vi.mocked(runGraphileWorker).mockReset();
        vi.mocked(runGraphileWorker).mockImplementation(async (options) => {
            const fakeRunner = makeFakeGraphileRunner();
            fakeRunners.push(fakeRunner);
            runnerOptions.push(options);
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

    it('blocks Graphile dequeue while a fresh migration lease is active', async () => {
        let active = false;
        const worker = makeWorker(() => active);
        await worker.run();
        active = true;
        await vi.advanceTimersByTimeAsync(10);

        let settled = false;
        const forbiddenFlags = runnerOptions[0]?.forbiddenFlags;
        expect(forbiddenFlags).toBeTypeOf('function');
        const dequeue = Promise.resolve(
            typeof forbiddenFlags === 'function' ? forbiddenFlags() : null,
        )
            .then(() => {
                settled = true;
            })
            .catch(() => {
                settled = true;
            });
        await vi.advanceTimersByTimeAsync(89);

        expect(settled).toBe(false);
        await worker.stop();
        await dequeue;
    });

    it('uses Graphile native shutdown to park jobs after the grace period', async () => {
        let active = false;
        const worker = makeWorker(() => active);
        await worker.run();
        active = true;

        await vi.advanceTimersByTimeAsync(110);

        expect(
            fakeRunners[0]?.workerPool.gracefulShutdown,
        ).toHaveBeenCalledExactlyOnceWith(
            'Migration lease grace period expired',
        );
        await worker.stop();
    });

    it('starts at reduced concurrency after jitter and adds capacity after the ramp', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        let active = true;
        const worker = makeWorker(() => active);
        await worker.run();
        expect(runGraphileWorker).not.toHaveBeenCalled();

        active = false;
        await vi.advanceTimersByTimeAsync(59);
        expect(runGraphileWorker).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(runnerOptions[0]?.concurrency).toBe(1);
        expect(runnerOptions[0]?.parsedCronItems).not.toEqual([]);

        await vi.advanceTimersByTimeAsync(200);
        expect(runnerOptions[1]?.concurrency).toBe(2);
        expect(runnerOptions[1]?.parsedCronItems).toEqual([]);
        await worker.stop();
    });
});
