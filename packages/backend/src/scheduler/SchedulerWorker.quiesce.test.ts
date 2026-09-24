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
    holdJob: () => () => void;
};

const makeConfig = (): LightdashConfig =>
    ({
        scheduler: {
            tasks: [...ALL_TASK_NAMES],
            concurrency: 3,
            pollInterval: 1_000,
            jobTimeout: 60_000,
            shutdownTimeout: 1_000,
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
    let activeJob: Promise<void> | null = null;
    let jobsReleased = false;
    let stopped = false;
    let settle!: () => void;
    const promise = new Promise<void>((resolve) => {
        settle = resolve;
    });
    const workerPool = {
        release: vi.fn(async () => {
            settle();
        }),
        gracefulShutdown: vi.fn(async () => {
            jobsReleased = true;
            settle();
        }),
        promise,
    };
    const runner = {
        promise,
        stop: vi.fn(async () => {
            if (stopped) throw new Error('Runner is already stopped');
            stopped = true;
            settle();
            if (!jobsReleased) await activeJob;
        }),
        addJob: vi.fn(),
        events: undefined,
    } as unknown as Runner;
    return {
        runner,
        workerPool,
        holdJob: () => {
            let finish!: () => void;
            activeJob = new Promise<void>((resolve) => {
                finish = resolve;
            });
            return finish;
        },
    };
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

    it('stops dequeuing without releasing jobs after the grace period', async () => {
        let active = false;
        const worker = makeWorker(() => active);
        await worker.run();
        active = true;

        await vi.advanceTimersByTimeAsync(110);

        expect(fakeRunners[0]?.runner.stop).toHaveBeenCalledOnce();
        expect(
            fakeRunners[0]?.workerPool.gracefulShutdown,
        ).not.toHaveBeenCalled();
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

    it.each(['short', 'past grace'])(
        'drains a running job before resuming after a %s lease',
        async (lease) => {
            vi.spyOn(Math, 'random').mockReturnValue(0);
            let active = false;
            const worker = makeWorker(() => active);
            await worker.run();
            const firstRunner = fakeRunners[0];
            const finishJob = firstRunner.holdJob();
            try {
                active = true;
                await vi.advanceTimersByTimeAsync(10);
                if (lease === 'past grace') {
                    await vi.advanceTimersByTimeAsync(100);
                }
                active = false;
                await vi.advanceTimersByTimeAsync(2_000);

                expect(
                    firstRunner.workerPool.gracefulShutdown,
                ).not.toHaveBeenCalled();
                expect(runGraphileWorker).toHaveBeenCalledOnce();
                expect(worker.isQuiesced).toBe(true);

                finishJob();
                await vi.advanceTimersByTimeAsync(201);
                expect(
                    runnerOptions.map(({ concurrency }) => concurrency),
                ).toEqual([3, 1, 2]);
                expect(worker.isQuiesced).toBe(false);
            } finally {
                finishJob();
                await worker.stop();
            }
        },
    );

    it('joins an ongoing migration drain on shutdown without restarting workers', async () => {
        let active = false;
        const worker = makeWorker(() => active);
        await worker.run();
        const firstRunner = fakeRunners[0];
        const finishJob = firstRunner.holdJob();
        active = true;
        await vi.advanceTimersByTimeAsync(10);
        active = false;
        await vi.advanceTimersByTimeAsync(10);

        let stopped = false;
        const stopping = worker.stop().then(() => {
            stopped = true;
        });
        try {
            await vi.advanceTimersByTimeAsync(999);
            expect(stopped).toBe(false);
            expect(firstRunner.runner.stop).toHaveBeenCalledOnce();
        } finally {
            finishJob();
            await stopping;
        }
        await vi.advanceTimersByTimeAsync(500);
        expect(runGraphileWorker).toHaveBeenCalledOnce();
        expect(firstRunner.workerPool.gracefulShutdown).not.toHaveBeenCalled();
    });

    it('keeps dequeue paused if the lease reactivates during a drain', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        let active = false;
        const worker = makeWorker(() => active);
        await worker.run();
        const firstRunner = fakeRunners[0];
        const finishJob = firstRunner.holdJob();
        try {
            active = true;
            await vi.advanceTimersByTimeAsync(10);
            active = false;
            await vi.advanceTimersByTimeAsync(10);
            active = true;
            await vi.advanceTimersByTimeAsync(110);
            finishJob();
            await vi.advanceTimersByTimeAsync(500);

            expect(worker.isQuiesced).toBe(true);
            expect(runGraphileWorker).toHaveBeenCalledOnce();
            expect(firstRunner.runner.stop).toHaveBeenCalledOnce();

            active = false;
            await vi.advanceTimersByTimeAsync(211);
            expect(runnerOptions.map(({ concurrency }) => concurrency)).toEqual(
                [3, 1, 2],
            );
            expect(worker.isQuiesced).toBe(false);
        } finally {
            finishJob();
            await worker.stop();
        }
    });
});
