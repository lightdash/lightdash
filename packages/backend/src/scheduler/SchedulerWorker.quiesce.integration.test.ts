import { SCHEDULER_TASKS } from '@lightdash/common';
import {
    makeWorkerUtils,
    type RunnerOptions,
    type Task,
    type TaskList,
    type WorkerUtils,
} from 'graphile-worker';
import { randomUUID } from 'node:crypto';
import { type PoolClient } from 'pg';
import { type LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import {
    SchedulerWorker,
    type SchedulerWorkerArguments,
} from './SchedulerWorker';

const graphile = vi.hoisted(() => ({ schema: '', stops: 0 }));

// Only redirect the schema; queue locking and runner shutdown use real Graphile.
vi.mock('graphile-worker', async (importOriginal) => {
    const actual = await importOriginal<typeof import('graphile-worker')>();
    return {
        ...actual,
        run: (options: RunnerOptions) => {
            options.events?.on('stop', () => {
                graphile.stops += 1;
            });
            return actual.run({ ...options, schema: graphile.schema });
        },
    };
});

vi.mock('./SchedulerTaskTracer', () => ({
    traceTasks: (tasks: TaskList) => tasks,
}));

const makeGate = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
};

describe('SchedulerWorker migration quiesce with PostgreSQL', () => {
    let utils: WorkerUtils;
    let leaseActive: boolean;
    let task: (...args: Parameters<Task>) => Promise<void>;
    let finishJob: ReturnType<typeof makeGate>;
    const workers: SchedulerWorker[] = [];

    beforeEach(async () => {
        // Graphile debug logs include the database connection string.
        vi.spyOn(Logger, 'debug').mockImplementation(() => Logger);
        const connectionString = process.env.SCHEDULER_TEST_DATABASE_URL;
        if (!connectionString) {
            throw new Error(
                'Set SCHEDULER_TEST_DATABASE_URL to a test database. This suite creates an isolated Graphile schema and does not run application migrations or seeds.',
            );
        }
        graphile.schema = `scheduler_quiesce_${randomUUID().replaceAll('-', '')}`;
        graphile.stops = 0;
        leaseActive = false;
        finishJob = makeGate();
        workers.length = 0;
        utils = await makeWorkerUtils({
            connectionString,
            schema: graphile.schema,
            maxPoolSize: 2,
        });
        await utils.migrate();
    });

    afterEach(async () => {
        finishJob?.resolve();
        try {
            await Promise.all(workers.map((worker) => worker.stop()));
            if (utils) {
                await utils.withPgClient((client) =>
                    client.query(
                        `DROP SCHEMA IF EXISTS "${graphile.schema}" CASCADE`,
                    ),
                );
            }
        } finally {
            try {
                await utils?.release();
            } finally {
                vi.restoreAllMocks();
            }
        }
    });

    const startWorker = async () => {
        class TestSchedulerWorker extends SchedulerWorker {
            protected getTaskList() {
                return { [SCHEDULER_TASKS.COMPILE_PROJECT]: task };
            }

            protected getCronItems() {
                return [];
            }
        }

        const worker = new TestSchedulerWorker({
            lightdashConfig: {
                scheduler: {
                    tasks: [SCHEDULER_TASKS.COMPILE_PROJECT],
                    concurrency: 2,
                    pollInterval: 20,
                    shutdownTimeout: 2_000,
                    quiesce: {
                        pollInterval: 20,
                        gracePeriod: 300,
                        resumeJitter: 0,
                        resumeRampPeriod: 50,
                    },
                },
                database: {
                    connectionUri: process.env.SCHEDULER_TEST_DATABASE_URL,
                    maxConnections: 4,
                },
            } as LightdashConfig,
            schedulerClient: {
                graphileUtils: Promise.resolve({
                    withPgClient: async (
                        callback: Parameters<WorkerUtils['withPgClient']>[0],
                    ) =>
                        callback({
                            query: async () => ({
                                rows: [{ active: leaseActive }],
                            }),
                        } as unknown as PoolClient),
                }),
            },
        } as unknown as SchedulerWorkerArguments);
        workers.push(worker);
        await worker.run();
        return worker;
    };

    it.each([
        { lease: 'short', maxAttempts: 2, failFirstAttempt: false },
        { lease: 'past grace', maxAttempts: 2, failFirstAttempt: false },
        { lease: 'short', maxAttempts: 1, failFirstAttempt: false },
        { lease: 'short', maxAttempts: 2, failFirstAttempt: true },
    ])(
        'keeps the running job owned across a $lease lease (maxAttempts=$maxAttempts, failFirstAttempt=$failFirstAttempt)',
        async ({ lease, maxAttempts, failFirstAttempt }) => {
            let activeExecutions = 0;
            let maximumActiveExecutions = 0;
            let starts = 0;
            const completed = new Set<string>();
            task = async (_payload, { job }) => {
                if (job.priority === -10) {
                    starts += 1;
                    activeExecutions += 1;
                    maximumActiveExecutions = Math.max(
                        maximumActiveExecutions,
                        activeExecutions,
                    );
                    await finishJob.promise;
                    activeExecutions -= 1;
                    if (failFirstAttempt && job.attempts === 1) {
                        throw new Error('Controlled task failure');
                    }
                }
                completed.add(job.id);
            };

            const firstWorker = await startWorker();
            const job = await utils.addJob(
                SCHEDULER_TASKS.COMPILE_PROJECT,
                {},
                { maxAttempts, priority: -10 },
            );
            await vi.waitFor(() => expect(starts).toBe(1));
            const readJob = () =>
                utils.withPgClient(async (client) => {
                    const result = await client.query<{
                        locked_by: string | null;
                        attempts: number;
                        last_error: string | null;
                    }>(
                        `SELECT locked_by, attempts, last_error FROM "${graphile.schema}".jobs WHERE id = $1`,
                        [job.id],
                    );
                    return result.rows;
                });
            const [originalOwnership] = await readJob();
            expect(originalOwnership.locked_by).not.toBeNull();

            leaseActive = true;
            await vi.waitFor(() => expect(firstWorker.isQuiesced).toBe(true));
            if (lease === 'past grace') {
                await vi.waitFor(() =>
                    expect(graphile.stops).toBeGreaterThan(0),
                );
            }
            leaseActive = false;
            await vi.waitFor(() => expect(graphile.stops).toBeGreaterThan(0));

            // Advance a released job's retry time without changing its ownership.
            const makeRetryDue = () =>
                utils.withPgClient((client) =>
                    client.query(
                        `UPDATE "${graphile.schema}".jobs SET run_at = now() WHERE id = $1 AND locked_by IS NULL`,
                        [job.id],
                    ),
                );
            await makeRetryDue();
            const competingWorker = await startWorker();
            const sentinel = await utils.addJob(
                SCHEDULER_TASKS.COMPILE_PROJECT,
                {},
            );
            await vi.waitFor(() =>
                expect(completed.has(sentinel.id)).toBe(true),
            );

            expect(maximumActiveExecutions).toBe(1);
            expect(starts).toBe(1);
            expect(await readJob()).toEqual([originalOwnership]);
            await competingWorker.stop();

            finishJob.resolve();
            if (failFirstAttempt) {
                await vi.waitFor(async () => {
                    expect(await readJob()).toEqual([
                        {
                            locked_by: null,
                            attempts: 1,
                            last_error: 'Controlled task failure',
                        },
                    ]);
                });
                await makeRetryDue();
            }
            await vi.waitFor(async () => expect(await readJob()).toEqual([]));
            await vi.waitFor(() => expect(firstWorker.isQuiesced).toBe(false));
            expect(starts).toBe(failFirstAttempt ? 2 : 1);
            expect(maximumActiveExecutions).toBe(1);

            const followup = await utils.addJob(
                SCHEDULER_TASKS.COMPILE_PROJECT,
                {},
            );
            await vi.waitFor(() =>
                expect(completed.has(followup.id)).toBe(true),
            );
        },
    );
});
