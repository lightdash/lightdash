import {
    ALL_TASK_NAMES,
    JobStatusType,
    SCHEDULER_TASKS,
} from '@lightdash/common';
import {
    run as runGraphileWorker,
    type Runner,
    type WorkerPool,
} from 'graphile-worker';
import { type LightdashConfig } from '../config/parseConfig';
import {
    armCompileShutdown,
    CompileInterruptedError,
    compileShutdown,
    disarmCompileShutdown,
    type CompileShutdownContext,
} from './compileShutdown';
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

const makeWorker = (
    workerHealth?: SchedulerWorkerHealth,
    markFailed = vi.fn(),
): SchedulerWorker => {
    const query = vi.fn(async () => ({ rows: [{ active: false }] }));
    const graphileUtils = Promise.resolve({
        addJob: vi.fn(),
        withPgClient: vi.fn(async (callback) => callback({ query } as never)),
    });

    return new SchedulerWorker({
        lightdashConfig: makeConfig(),
        schedulerClient: { graphileUtils },
        workerHealth,
        projectService: { _markInterruptedCompileAsFailed: markFailed },
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
    it.each([
        SCHEDULER_TASKS.COMPILE_PROJECT,
        SCHEDULER_TASKS.TEST_AND_COMPILE_PROJECT,
    ])('fails an armed %s before the drain deadline', async (taskName) => {
        const markFailed = vi.fn().mockResolvedValue(undefined);
        const worker = makeWorker(undefined, markFailed);
        await worker.run();
        const [fakeRunner] = fakeRunners;
        let signal: AbortSignal | undefined;
        const interrupted = async () => {
            signal = armCompileShutdown();
            await new Promise<void>((_resolve, reject) => {
                signal!.addEventListener(
                    'abort',
                    () => reject(signal!.reason),
                    { once: true },
                );
            });
        };
        const methods = worker as unknown as {
            compileProject: typeof interrupted;
            testAndCompileProject: typeof interrupted;
            getFullTaskList(): Record<
                string,
                (payload: unknown, helpers: unknown) => Promise<void>
            >;
        };
        methods.compileProject = interrupted;
        methods.testAndCompileProject = interrupted;
        const work = methods
            .getFullTaskList()
            [taskName](
                { jobUuid: 'leaf_a' },
                { job: { id: '1', run_at: new Date() } },
            )
            .catch((error: unknown) => error)
            .finally(() => fakeRunner.finishActiveJobs());
        await vi.advanceTimersByTimeAsync(0);
        const stopping = worker.stop();
        await stopping;
        const error = await work;
        expect(signal?.aborted).toBe(true);
        expect(error).toHaveProperty(
            'message',
            'The worker shut down while this project was compiling. Refresh dbt again.',
        );
        expect(markFailed).toHaveBeenCalledExactlyOnceWith(
            'leaf_a',
            signal?.reason.message,
        );
        expect(fakeRunner.workerPool.gracefulShutdown).not.toHaveBeenCalled();
    });

    it('fails the job before releasing a compile that does not settle on abort', async () => {
        const markFailed = vi.fn().mockResolvedValue(undefined);
        const worker = makeWorker(undefined, markFailed);
        await worker.run();
        const [fakeRunner] = fakeRunners;
        const run = (
            worker as unknown as {
                runCompileTask(
                    jobUuid: string,
                    task: () => Promise<void>,
                ): Promise<void>;
            }
        ).runCompileTask.bind(worker);
        let release!: () => void;
        const work = run('leaf_a', async () => {
            armCompileShutdown();
            await new Promise<void>((done) => {
                release = done;
            });
        });
        try {
            const stopping = worker.stop();
            expect(markFailed).toHaveBeenCalledExactlyOnceWith(
                'leaf_a',
                new CompileInterruptedError().message,
            );
            expect(
                fakeRunner.workerPool.gracefulShutdown,
            ).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS);
            await stopping;
            expect(markFailed).toHaveBeenCalledExactlyOnceWith(
                'leaf_a',
                'The worker shut down while this project was compiling. Refresh dbt again.',
            );
            expect(markFailed.mock.invocationCallOrder[0]).toBeLessThan(
                vi.mocked(fakeRunner.workerPool.gracefulShutdown).mock
                    .invocationCallOrder[0],
            );
        } finally {
            release();
            await work;
        }
    });

    it('aborts and fails a compile armed during the drain', async () => {
        const markFailed = vi.fn().mockResolvedValue(undefined);
        const worker = makeWorker(undefined, markFailed);
        await worker.run();
        let arm!: () => void;
        let release!: () => void;
        let signal: AbortSignal | undefined;
        const run = (
            worker as unknown as {
                runCompileTask(
                    jobUuid: string,
                    task: () => Promise<void>,
                ): Promise<void>;
            }
        ).runCompileTask.bind(worker);
        const work = run('leaf_a', async () => {
            await new Promise<void>((done) => {
                arm = done;
            });
            signal = armCompileShutdown();
            await new Promise<void>((done) => {
                release = done;
            });
        });
        const stopping = worker.stop();
        arm();
        await vi.advanceTimersByTimeAsync(0);
        expect(signal?.aborted).toBe(true);
        expect(signal?.reason).toBeInstanceOf(CompileInterruptedError);
        expect(markFailed).toHaveBeenCalledExactlyOnceWith(
            'leaf_a',
            new CompileInterruptedError().message,
        );
        release();
        await work;
        fakeRunners[0].finishActiveJobs();
        await stopping;
    });

    it('does not fail a completed compile while its scheduler wrapper is pending', async () => {
        let status = JobStatusType.RUNNING;
        const markFailed = vi.fn(async () => {
            status = JobStatusType.ERROR;
        });
        const worker = makeWorker(undefined, markFailed);
        let release!: () => void;
        let signal: AbortSignal | undefined;
        const run = (
            worker as unknown as {
                runCompileTask(
                    jobUuid: string,
                    task: () => Promise<void>,
                ): Promise<void>;
            }
        ).runCompileTask.bind(worker);
        const work = run('leaf_a', async () => {
            signal = armCompileShutdown();
            status = JobStatusType.DONE;
            disarmCompileShutdown();
            await new Promise<void>((done) => {
                release = done;
            });
        });
        await worker.stop();
        expect(signal?.aborted).toBe(false);
        expect(markFailed).not.toHaveBeenCalled();
        expect(status).toBe(JobStatusType.DONE);
        release();
        await work;
    });

    it('leaves an unarmed compile controller untouched', async () => {
        const worker = makeWorker();
        const run = (
            worker as unknown as {
                runCompileTask(
                    jobUuid: string,
                    task: () => Promise<void>,
                ): Promise<void>;
            }
        ).runCompileTask.bind(worker);
        let context: CompileShutdownContext | undefined;
        let release!: () => void;
        const work = run('leaf_a', async () => {
            context = compileShutdown.getStore();
            await new Promise<void>((done) => {
                release = done;
            });
        });
        try {
            await worker.stop();
            expect(context?.controller.signal.aborted).toBe(false);
        } finally {
            release();
            await work;
        }
    });
});
