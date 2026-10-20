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

    it.each([false, true])(
        'still releases runners when the failure write rejects, dead pool=%s',
        async (deadPool) => {
            const markFailed = vi
                .fn()
                .mockRejectedValue(new Error('leaf_b write failed'));
            const health = new SchedulerWorkerHealth();
            const worker = makeWorker(health, markFailed);
            await worker.run();
            const methods = worker as unknown as {
                runCompileTask(
                    jobUuid: string,
                    task: () => Promise<void>,
                ): Promise<void>;
                stopManagedRunnersForRetry(reason: string): Promise<void>;
            };
            const stopForRetry = vi.spyOn(
                methods,
                'stopManagedRunnersForRetry',
            );
            let release!: () => void;
            const work = methods.runCompileTask('leaf_a', async () => {
                armCompileShutdown();
                await new Promise<void>((resolve) => {
                    release = resolve;
                });
            });
            try {
                if (deadPool) health.markPoolDead('leaf_b');
                const stopping = worker.stop();
                await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS);
                await expect(stopping).resolves.toBeUndefined();
                expect(markFailed).toHaveBeenCalledOnce();
                expect(
                    fakeRunners[0].workerPool.gracefulShutdown,
                ).toHaveBeenCalledOnce();
                if (deadPool) expect(stopForRetry).toHaveBeenCalledOnce();
            } finally {
                release();
                await work;
            }
        },
    );

    it('rethrows the original compile error when the failure write rejects', async () => {
        const markFailed = vi
            .fn()
            .mockRejectedValue(new Error('leaf_b write failed'));
        const worker = makeWorker(undefined, markFailed);
        const methods = worker as unknown as {
            runCompileTask(
                jobUuid: string,
                task: () => Promise<void>,
            ): Promise<void>;
        };
        const reason = new CompileInterruptedError();
        await expect(
            methods.runCompileTask('leaf_a', async () => {
                armCompileShutdown();
                compileShutdown.getStore()!.controller.abort(reason);
                throw reason;
            }),
        ).rejects.toBe(reason);
        expect(markFailed).toHaveBeenCalledOnce();
    });

    it('does not fail an armed compile whose controller has not aborted', async () => {
        const markFailed = vi.fn();
        const worker = makeWorker(undefined, markFailed);
        const methods = worker as unknown as {
            failInterruptedCompile(
                context: CompileShutdownContext,
            ): Promise<void>;
        };
        await methods.failInterruptedCompile({
            controller: new AbortController(),
            jobUuid: 'leaf_a',
            armed: true,
            state: 'running',
            isStopping: () => false,
            interrupt: vi.fn(),
        });
        expect(markFailed).not.toHaveBeenCalled();
    });

    it('does not wait for a stalled failure write when the pool is dead', async () => {
        const markFailed = vi.fn(() => new Promise<void>(() => {}));
        const health = new SchedulerWorkerHealth();
        const worker = makeWorker(health, markFailed);
        await worker.run();
        const methods = worker as unknown as {
            runCompileTask(
                jobUuid: string,
                task: () => Promise<void>,
            ): Promise<void>;
        };
        let release!: () => void;
        const work = methods.runCompileTask('leaf_a', async () => {
            armCompileShutdown();
            await new Promise<void>((resolve) => {
                release = resolve;
            });
        });
        health.markPoolDead('leaf_b');
        try {
            await worker.stop();
            expect(
                fakeRunners[0].workerPool.gracefulShutdown,
            ).toHaveBeenCalledOnce();
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

    it.each(['publishing', 'published'] as const)(
        'lets a %s compile finish its tail during shutdown',
        async (state) => {
            const markFailed = vi.fn();
            const worker = makeWorker(undefined, markFailed);
            await worker.run();
            let release!: () => void;
            let context!: CompileShutdownContext;
            const methods = worker as unknown as {
                runCompileTask(
                    jobUuid: string,
                    task: () => Promise<void>,
                ): Promise<void>;
            };
            const work = methods.runCompileTask('leaf_a', async () => {
                armCompileShutdown();
                context = compileShutdown.getStore()!;
                context.state = state;
                await new Promise<void>((resolve) => {
                    release = resolve;
                });
                disarmCompileShutdown();
            });
            const stopping = worker.stop();
            await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS - 1);
            expect(context.armed).toBe(true);
            expect(context.controller.signal.aborted).toBe(false);
            expect(markFailed).not.toHaveBeenCalled();
            release();
            await work;
            fakeRunners[0].finishActiveJobs();
            await stopping;
            expect(context.state).toBe('terminal');
            expect(markFailed).not.toHaveBeenCalled();
        },
    );

    it.each(['running', 'publishing', 'published'] as const)(
        'releases healthy runners despite a stalled %s failure write',
        async (state) => {
            let finishWrite!: () => void;
            const markFailed = vi.fn(
                () =>
                    new Promise<void>((resolve) => {
                        finishWrite = resolve;
                    }),
            );
            const worker = makeWorker(undefined, markFailed);
            await worker.run();
            const methods = worker as unknown as {
                runCompileTask(
                    jobUuid: string,
                    task: () => Promise<void>,
                ): Promise<void>;
            };
            let release!: () => void;
            let context!: CompileShutdownContext;
            const work = methods.runCompileTask('leaf_a', async () => {
                armCompileShutdown();
                context = compileShutdown.getStore()!;
                context.state = state;
                await new Promise<void>((resolve) => {
                    release = resolve;
                });
            });
            try {
                const stopping = worker.stop();
                await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS - 1);
                expect(markFailed).toHaveBeenCalledTimes(
                    state === 'running' ? 1 : 0,
                );
                await vi.advanceTimersByTimeAsync(1);
                expect(markFailed).toHaveBeenCalledOnce();
                await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS);
                await stopping;
                expect(
                    fakeRunners[0].workerPool.gracefulShutdown,
                ).toHaveBeenCalledOnce();
                expect(context.controller.signal.aborted).toBe(
                    state === 'running',
                );
            } finally {
                finishWrite();
                release();
                await work;
            }
        },
    );

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
