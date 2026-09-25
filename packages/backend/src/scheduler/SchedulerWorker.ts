import {
    GenerateDailySchedulerJobError,
    getErrorMessage,
    getSchedulerUuid,
    isSchedulerTaskName,
    SCHEDULER_TASKS,
    SchedulerJobStatus,
    sleep,
    type SchedulerAndTargets,
    type SchedulerTaskName,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    Logger as GraphileLogger,
    parseCronItems,
    run as runGraphileWorker,
    Runner,
    type CronItem,
    type WorkerEvents,
    type WorkerPool,
} from 'graphile-worker';
import moment from 'moment';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import pLimit from 'p-limit';
import type { PoolClient } from 'pg';
import { UsageEventsCompactor } from '../analytics/eventStream/UsageEventsCompactor';
import { DEFAULT_DB_MAX_CONNECTIONS } from '../knexfile';
import Logger from '../logging/logger';
import type { UsageDimensionsModel } from '../models/UsageDimensionsModel';
import type PrometheusMetrics from '../prometheus/PrometheusMetrics';
import { type OrganizationNameResolver } from '../sentry/organizationNameResolver';
import { LEARN_SANDBOX_COMMAND_TIMEOUT_MS } from '../services/LearnSandboxService/runtime';
import type { SchedulerProjectContext } from '../services/SchedulerService/SchedulerService';
import { MigrationLeaseProbe } from './MigrationLeaseProbe';
import { SchedulerClient } from './SchedulerClient';
import {
    resolveSchedulerDeliveryFailureAction,
    SchedulerDeliveryError,
} from './SchedulerDeliveryError';
import { tryJobOrTimeout } from './SchedulerJobTimeout';
import {
    MigrationDequeueWaitCancelledError,
    SchedulerMigrationQuiesce,
} from './SchedulerMigrationQuiesce';
import SchedulerTask, { type SchedulerTaskArguments } from './SchedulerTask';
import { traceTasks } from './SchedulerTaskTracer';
import schedulerWorkerEventEmitter from './SchedulerWorkerEventEmitter';
import { SchedulerWorkerHealth } from './SchedulerWorkerHealth';
import { TypedTaskList } from './types';

export type SchedulerWorkerArguments = SchedulerTaskArguments & {
    usageDimensionsModel: UsageDimensionsModel;
    // When omitted, no pg-ping interval runs and the health probe falls back to
    // job-activity events alone.
    workerHealth?: SchedulerWorkerHealth;
    resolveOrganizationName?: OrganizationNameResolver;
    // When omitted, worker tasks that report metrics simply skip reporting.
    prometheusMetrics?: PrometheusMetrics;
    dailyJobRetryBackoffMs?: readonly [number, number];
};

const DEFAULT_DAILY_JOB_RETRY_BACKOFF_MS = [2_000, 5_000] as const;
const DAILY_JOB_FAILURE_SUMMARY_UUID_LIMIT = 20;

const getErrorProperty = (
    error: unknown,
    property: 'cause' | 'code' | 'name',
): unknown => {
    if (typeof error !== 'object' || error === null) {
        return undefined;
    }
    return Reflect.get(error, property);
};

const isTransientKnexConnectionError = (error: unknown): boolean => {
    const name = getErrorProperty(error, 'name');
    if (name === 'KnexTimeoutError') {
        return true;
    }

    const code = getErrorProperty(error, 'code');
    if (
        typeof code === 'string' &&
        (code.startsWith('08') ||
            ['57P01', '57P02', '57P03', '53300'].includes(code) ||
            ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'].includes(code))
    ) {
        return true;
    }

    const message = getErrorMessage(error).toLowerCase();
    if (
        [
            'knex: timeout acquiring a connection',
            'unable to acquire a connection',
            'connection terminated unexpectedly',
            'pool is destroyed',
        ].some((fragment) => message.includes(fragment))
    ) {
        return true;
    }

    const cause = getErrorProperty(error, 'cause');
    return cause !== undefined && isTransientKnexConnectionError(cause);
};

const workerLogger = new GraphileLogger(
    (scope) => (logLevel, message, meta) => {
        if (logLevel === 'error') {
            return Logger.error(message, { meta, scope });
        }

        return Logger.debug(message, { meta, scope });
    },
);

// 60s vs the 3-min staleness threshold gives 3x headroom for ping latency.
const PG_PING_INTERVAL_MS = 60_000;

// Cap each ping: a wedged pg backend can leave the query hanging forever and
// stack up overlapping client borrows from the pool.
const PG_PING_TIMEOUT_MS = 5_000;

// The ping doubles as a worker-pool liveness probe. The NOTIFY on graphile's
// jobs:insert channel makes every listener in this database — including this
// process's own — nudge its worker pool. A terminated pool fails that nudge
// ("nudge called after worker terminated"), which surfaces via
// pool:listen:error and trips the poolDead latch. Without this, an idle dead
// worker looks healthy forever: nothing else generates NOTIFYs on a quiet
// instance, and the wedged runner stops enqueueing even its own cron jobs.
// The ping's pool (SchedulerClient's WorkerUtils) is separate from the
// runner's, so it keeps working when the runner is wedged.
const PG_PING_QUERY = `SELECT pg_notify('jobs:insert', '')`;

type ManagedRunner = {
    runner: Runner;
    workerPool: WorkerPool | null;
    stopPromise: Promise<void> | null;
};

class ForwardingWorkerEvents extends EventEmitter {
    constructor(private readonly target: EventEmitter) {
        super();
    }

    emit(eventName: string | symbol, ...args: unknown[]): boolean {
        const emitted = super.emit(eventName, ...args);
        return this.target.emit(eventName, ...args) || emitted;
    }
}

export class SchedulerWorker extends SchedulerTask {
    runner: Runner | undefined;

    isRunning: boolean = false;

    isQuiesced: boolean = false;

    enabledTasks: Array<SchedulerTaskName>;

    protected readonly workerHealth: SchedulerWorkerHealth | undefined;

    private pgPingInterval: NodeJS.Timeout | null = null;

    private isStopping: boolean = false;

    private readonly resolveOrganizationName?: OrganizationNameResolver;

    private readonly prometheusMetrics: PrometheusMetrics | null;

    private readonly usageDimensionsModel: UsageDimensionsModel;

    private readonly managedRunners = new Set<ManagedRunner>();

    private readonly expectedRunnerStops = new Set<Runner>();

    private migrationQuiesce: SchedulerMigrationQuiesce | null = null;

    private maxPoolSize = 0;

    private runnerStopPromise: Promise<void> | null = null;

    private readonly dailyJobRetryBackoffMs: readonly [number, number];

    constructor(schedulerWorkerArgs: SchedulerWorkerArguments) {
        super(schedulerWorkerArgs);
        this.enabledTasks = this.lightdashConfig.scheduler.tasks;
        this.workerHealth = schedulerWorkerArgs.workerHealth;
        this.resolveOrganizationName =
            schedulerWorkerArgs.resolveOrganizationName;
        this.prometheusMetrics = schedulerWorkerArgs.prometheusMetrics ?? null;
        this.usageDimensionsModel = schedulerWorkerArgs.usageDimensionsModel;
        this.dailyJobRetryBackoffMs =
            schedulerWorkerArgs.dailyJobRetryBackoffMs ??
            DEFAULT_DAILY_JOB_RETRY_BACKOFF_MS;
    }

    private async generateDailyJobsForScheduler(
        scheduler: SchedulerAndTargets,
        currentDateStartOfDay: Date,
        attempt = 0,
        cachedProjectContext?: SchedulerProjectContext,
        cachedDefaultTimezone?: string,
    ): Promise<string> {
        let projectContext = cachedProjectContext;
        let defaultTimezone = cachedDefaultTimezone;

        try {
            projectContext ??=
                await this.schedulerService.getSchedulerProjectContext(
                    scheduler,
                );
            defaultTimezone ??=
                await this.schedulerService.getSchedulerDefaultTimezoneForScheduler(
                    scheduler,
                    projectContext,
                );

            await this.schedulerClient.generateDailyJobsForScheduler(
                scheduler,
                {
                    organizationUuid: projectContext.organizationUuid,
                    projectUuid: projectContext.projectUuid,
                    userUuid: scheduler.createdBy,
                },
                defaultTimezone,
                currentDateStartOfDay,
            );
            return scheduler.schedulerUuid;
        } catch (error) {
            const retryDelay = this.dailyJobRetryBackoffMs[attempt];
            if (
                retryDelay !== undefined &&
                isTransientKnexConnectionError(error)
            ) {
                await sleep(retryDelay);
                return this.generateDailyJobsForScheduler(
                    scheduler,
                    currentDateStartOfDay,
                    attempt + 1,
                    projectContext,
                    defaultTimezone,
                );
            }

            this.prometheusMetrics?.recordSchedulerDailyJobGenerationError(
                'scheduler',
            );
            await this.logDailyJobGenerationFailure(
                scheduler,
                currentDateStartOfDay,
                error,
                projectContext,
            );

            throw new GenerateDailySchedulerJobError(
                `Failed to generate daily jobs for scheduler ${scheduler.schedulerUuid} with: ${error}`,
                scheduler.schedulerUuid,
                error,
            );
        }
    }

    private async logDailyJobGenerationFailure(
        scheduler: SchedulerAndTargets,
        scheduledTime: Date,
        error: unknown,
        projectContext: SchedulerProjectContext | undefined,
        jobId = randomUUID(),
        attempt = 0,
    ): Promise<void> {
        try {
            await this.schedulerService.logSchedulerJob({
                task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                status: SchedulerJobStatus.ERROR,
                schedulerUuid: scheduler.schedulerUuid,
                scheduledTime,
                jobId,
                jobGroup: jobId,
                details: {
                    error: getErrorMessage(error),
                    createdByUserUuid: scheduler.createdBy,
                    ...(projectContext && {
                        projectUuid: projectContext.projectUuid,
                        organizationUuid: projectContext.organizationUuid,
                    }),
                },
            });
        } catch (logError) {
            const retryDelay = this.dailyJobRetryBackoffMs[attempt];
            if (
                retryDelay !== undefined &&
                isTransientKnexConnectionError(logError)
            ) {
                await sleep(retryDelay);
                return this.logDailyJobGenerationFailure(
                    scheduler,
                    scheduledTime,
                    error,
                    projectContext,
                    jobId,
                    attempt + 1,
                );
            }
            Logger.error(
                `Failed to log daily job generation error for scheduler ${scheduler.schedulerUuid}`,
                logError,
            );
        }
    }

    async run() {
        // Wait for graphile utils to finish migration and prevent race conditions
        await this.schedulerClient.graphileUtils;
        // Run a worker to execute jobs:
        Logger.info('Running scheduler');

        const dbMaxConnections =
            this.lightdashConfig.database.maxConnections ||
            DEFAULT_DB_MAX_CONNECTIONS;

        // According to Graphile TS docs, this defaults to the node-postgres default (10)
        // So we're keeping the setting the same when concurrency is less than 10
        const desiredPoolSize =
            this.lightdashConfig.scheduler.concurrency > 10
                ? this.lightdashConfig.scheduler.concurrency
                : 10;

        // We don't want to exceed the max number of connections to the database
        this.maxPoolSize = Math.min(desiredPoolSize, dbMaxConnections);

        const quiesceConfig = this.lightdashConfig.scheduler.quiesce;
        this.migrationQuiesce = new SchedulerMigrationQuiesce({
            probe: new MigrationLeaseProbe({
                graphileUtils: this.schedulerClient.graphileUtils,
                cacheMs: quiesceConfig.pollInterval,
            }),
            pollIntervalMs: quiesceConfig.pollInterval,
            gracePeriodMs: quiesceConfig.gracePeriod,
            resumeJitterMs: quiesceConfig.resumeJitter,
            resumeRampPeriodMs: quiesceConfig.resumeRampPeriod,
            hooks: {
                onQuiesceStateChange: (quiesced) => {
                    this.isQuiesced = quiesced;
                },
                onFailure: (error) => {
                    this.isQuiesced = false;
                    this.workerHealth?.markPoolDead(
                        `migration quiesce failed: ${getErrorMessage(error)}`,
                    );
                    Logger.error('Migration quiesce failed', error);
                },
                drainWorkers: (reason) =>
                    this.drainManagedRunnersForMigration(reason),
                startResumeWorkers: () => this.startResumeWorkers(),
                finishResumeRamp: () => this.finishResumeRamp(),
            },
        });

        const leaseActive = await this.migrationQuiesce.start();
        if (!leaseActive) {
            await this.startManagedRunner(
                this.lightdashConfig.scheduler.concurrency,
                this.maxPoolSize,
                true,
            );
            this.isQuiesced = false;
        } else {
            this.isQuiesced = true;
        }

        if (this.workerHealth) {
            this.startPgPing(this.workerHealth);
        }
    }

    async stop() {
        this.isStopping = true;
        this.migrationQuiesce?.stop();
        this.stopPgPing();
        await this.drainManagedRunners();
        this.isRunning = false;
        this.isQuiesced = false;
    }

    // Ordinary shutdown lets in-flight jobs finish: a single-attempt job
    // (evals, Slack prompts) released mid-run by fail_job can never be
    // re-acquired, and its handler's own error path dies with the process.
    // Past the deadline, or when the pool is already dead, fall back to the
    // fail_job release so jobs with attempts left move to a live worker.
    private async drainManagedRunners(): Promise<void> {
        const managedRunners = [...this.managedRunners];
        if (managedRunners.length === 0) {
            return;
        }
        if (this.workerHealth?.isPoolDead()) {
            await this.stopManagedRunnersForRetry(
                'Scheduler worker stopping with dead pool',
            );
            return;
        }

        const { shutdownTimeout } = this.lightdashConfig.scheduler;
        const drained = Promise.all(
            managedRunners.map((managedRunner) =>
                this.stopManagedRunner(managedRunner),
            ),
        ).then(
            () => 'drained' as const,
            (error: unknown) => {
                Logger.warn(
                    `Scheduler runner stop failed: ${getErrorMessage(error)}`,
                );
                return 'drained' as const;
            },
        );
        const deadline = new Promise<'timeout'>((resolve) => {
            setTimeout(() => resolve('timeout'), shutdownTimeout).unref();
        });

        const outcome = await Promise.race([drained, deadline]);
        if (outcome === 'timeout') {
            Logger.warn(
                `Scheduler shutdown drain exceeded ${shutdownTimeout}ms; releasing in-flight jobs for retry`,
            );
            // runner.stop() is already in flight, so only the pool-level
            // release is needed here.
            await Promise.all(
                managedRunners.map(({ workerPool }) =>
                    workerPool?.gracefulShutdown(
                        'Scheduler shutdown deadline exceeded',
                    ),
                ),
            );
        }
        this.managedRunners.clear();
        this.runner = undefined;
        this.isRunning = false;
    }

    private async startManagedRunner(
        concurrency: number,
        maxPoolSize: number,
        includeCron: boolean,
    ): Promise<void> {
        const events = new ForwardingWorkerEvents(
            schedulerWorkerEventEmitter as EventEmitter,
        ) as WorkerEvents;
        let workerPool: WorkerPool | null = null;
        events.once('pool:create', ({ workerPool: createdWorkerPool }) => {
            workerPool = createdWorkerPool;
        });
        events.on('worker:create', ({ worker }) => {
            const graphileWorker = worker;
            const release = graphileWorker.release.bind(graphileWorker);
            // Graphile 0.13 uses Promise.all for release. An expected dequeue
            // cancellation must not close the pool before other jobs finish.
            graphileWorker.release = () => {
                const released: unknown = release();
                if (released === undefined) return undefined;
                return graphileWorker.promise.catch((error: unknown) => {
                    if (
                        !(error instanceof MigrationDequeueWaitCancelledError)
                    ) {
                        throw error;
                    }
                });
            };
        });

        const runner = await runGraphileWorker({
            connectionString: this.lightdashConfig.database.connectionUri,
            logger: workerLogger,
            concurrency,
            noHandleSignals: true,
            pollInterval: this.lightdashConfig.scheduler.pollInterval,
            maxPoolSize,
            parsedCronItems: includeCron
                ? parseCronItems(this.getCronItems())
                : [],
            taskList: traceTasks(this.getTaskList(), {
                resolveOrganizationName: this.resolveOrganizationName,
            }),
            forbiddenFlags: () =>
                this.migrationQuiesce?.waitForDequeuePermit() ?? null,
            events,
        });

        const managedRunner: ManagedRunner = {
            runner,
            workerPool,
            stopPromise: null,
        };
        this.managedRunners.add(managedRunner);
        if (includeCron) {
            this.runner = runner;
        }
        this.isRunning = true;

        void runner.promise.finally(() => {
            // Graphile resolves runner.promise before active handlers finish.
            if (!this.expectedRunnerStops.delete(runner)) {
                this.managedRunners.delete(managedRunner);
                this.isRunning = this.managedRunners.size > 0;
                if (!this.isStopping) {
                    this.workerHealth?.markPoolDead(
                        'graphile runner stopped unexpectedly',
                    );
                }
            }
        });
    }

    private stopManagedRunner(entry: ManagedRunner): Promise<void> {
        const managedRunner = entry;
        if (managedRunner.stopPromise === null) {
            const { runner } = managedRunner;
            this.expectedRunnerStops.add(runner);
            managedRunner.stopPromise = runner.stop().finally(() => {
                this.expectedRunnerStops.delete(runner);
                this.managedRunners.delete(managedRunner);
                this.isRunning = this.managedRunners.size > 0;
                if (this.runner === runner) {
                    this.runner = undefined;
                }
            });
        }
        return managedRunner.stopPromise;
    }

    private async drainManagedRunnersForMigration(
        reason: string,
    ): Promise<void> {
        Logger.info(`Draining scheduler workers: ${reason}`);
        // Migration resume keeps this process alive, so never unlock live jobs.
        await Promise.all(
            [...this.managedRunners].map((managedRunner) =>
                this.stopManagedRunner(managedRunner),
            ),
        );
    }

    private async startResumeWorkers(): Promise<void> {
        await this.startManagedRunner(
            1,
            Math.max(1, Math.min(2, this.maxPoolSize)),
            true,
        );
    }

    private async finishResumeRamp(): Promise<void> {
        const remainingConcurrency =
            this.lightdashConfig.scheduler.concurrency - 1;
        if (remainingConcurrency <= 0) {
            return;
        }

        await this.startManagedRunner(
            remainingConcurrency,
            Math.max(1, this.maxPoolSize - 2),
            false,
        );
    }

    private async stopManagedRunnersForRetry(reason: string): Promise<void> {
        if (this.runnerStopPromise !== null) {
            await this.runnerStopPromise;
            return;
        }

        this.runnerStopPromise = this.performManagedRunnerStop(reason);
        try {
            await this.runnerStopPromise;
        } finally {
            this.runnerStopPromise = null;
        }
    }

    private async performManagedRunnerStop(reason: string): Promise<void> {
        const managedRunners = [...this.managedRunners];
        for (const { runner } of managedRunners) {
            this.expectedRunnerStops.add(runner);
        }

        await Promise.all(
            managedRunners.map(async (managedRunner) => {
                const { workerPool } = managedRunner;
                if (workerPool !== null) {
                    await workerPool.gracefulShutdown(reason);
                }
                try {
                    if (managedRunner.stopPromise === null) {
                        await this.stopManagedRunner(managedRunner);
                    }
                } catch (error) {
                    Logger.warn(
                        `Scheduler runner stop failed: ${getErrorMessage(error)}`,
                    );
                }
            }),
        );
        this.managedRunners.clear();
        this.runner = undefined;
        this.isRunning = false;
    }

    private startPgPing(health: SchedulerWorkerHealth) {
        if (this.pgPingInterval) return;
        void this.pingPgOnce(health);
        this.pgPingInterval = setInterval(() => {
            void this.pingPgOnce(health);
        }, PG_PING_INTERVAL_MS);
        Logger.info(
            `[scheduler-health] pg-ping started poolId=${health.getPoolId()} intervalMs=${PG_PING_INTERVAL_MS} timeoutMs=${PG_PING_TIMEOUT_MS}`,
        );
    }

    private stopPgPing() {
        if (this.pgPingInterval) {
            clearInterval(this.pgPingInterval);
            this.pgPingInterval = null;
            if (this.workerHealth) {
                Logger.info(
                    `[scheduler-health] pg-ping stopped poolId=${this.workerHealth.getPoolId()}`,
                );
            }
        }
    }

    private async pingPgOnce(health: SchedulerWorkerHealth) {
        let timeoutHandle: NodeJS.Timeout | undefined;
        let borrowedClient: PoolClient | undefined;
        let timedOut = false;
        try {
            const graphileClient = await this.schedulerClient.graphileUtils;
            const ping = graphileClient.withPgClient(async (pgClient) => {
                borrowedClient = pgClient;
                if (timedOut) {
                    pgClient.release(true);
                    return;
                }
                await pgClient.query(PG_PING_QUERY);
            });
            void ping.catch(() => undefined);
            await Promise.race([
                ping,
                new Promise<never>((_resolve, reject) => {
                    timeoutHandle = setTimeout(() => {
                        timedOut = true;
                        borrowedClient?.release(true);
                        reject(
                            new Error(
                                `pg ping timeout after ${PG_PING_TIMEOUT_MS}ms`,
                            ),
                        );
                    }, PG_PING_TIMEOUT_MS);
                    if (typeof timeoutHandle.unref === 'function')
                        timeoutHandle.unref();
                }),
            ]);
            health.markPgReachable();
            Logger.debug(
                `[scheduler-health] pg-ping ok poolId=${health.getPoolId()}`,
            );
        } catch (e) {
            // Sustained failure ages lastPgReachableAt past staleness — combined
            // with no job activity, the probe trips. A single failure is harmless.
            Logger.warn(
                `[scheduler-health] pg-ping failed poolId=${health.getPoolId()} error=${getErrorMessage(
                    e,
                )}`,
            );
        } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
        }
    }

    protected getCronItems(): CronItem[] {
        return [
            {
                task: 'generateDailyJobs',
                pattern: '0 0 * * *',
                options: {
                    backfillPeriod: 12 * 3600 * 1000, // 12 hours in ms
                    maxAttempts: 3,
                },
            },
            {
                task: SCHEDULER_TASKS.CLEAN_QUERY_HISTORY,
                pattern:
                    this.lightdashConfig.scheduler.queryHistory.cleanup
                        .schedule,
                options: {
                    backfillPeriod: 24 * 3600 * 1000, // 24 hours in ms
                    maxAttempts: 3,
                },
            },
            {
                task: SCHEDULER_TASKS.GENERATE_SLACK_CHANNEL_SYNC_JOBS,
                pattern: '0 6 * * *', // 6am UTC daily
                options: {
                    backfillPeriod: 24 * 3600 * 1000, // 24 hours in ms
                    maxAttempts: 3,
                },
            },
            {
                task: SCHEDULER_TASKS.CHECK_FOR_STUCK_JOBS,
                pattern: '*/30 * * * *', // Every 30 minutes
                options: {
                    backfillPeriod: 24 * 3600 * 1000, // 24 hours in ms
                    maxAttempts: 3,
                },
            },
            {
                task: SCHEDULER_TASKS.CLEAN_DEPLOY_SESSIONS,
                pattern: '0 * * * *', // Every hour
                options: {
                    backfillPeriod: 2 * 3600 * 1000, // 2 hours in ms
                    maxAttempts: 3,
                },
            },
            {
                task: SCHEDULER_TASKS.CLEAN_EXPIRED_PREVIEWS,
                pattern: '0 * * * *', // Every hour
                options: {
                    backfillPeriod: 2 * 3600 * 1000, // 2 hours in ms
                    maxAttempts: 3,
                },
            },
            {
                task: SCHEDULER_TASKS.COMPACT_USAGE_EVENTS,
                pattern: '30 0 * * *', // 00:30 UTC daily
                options: {
                    queueName: 'usage-events-compaction',
                    backfillPeriod: 12 * 3600 * 1000, // 12 hours in ms
                    maxAttempts: 3,
                },
            },
            {
                // Re-check pending email-whitelabel domains so verification
                // completes asynchronously as DNS propagates.
                task: SCHEDULER_TASKS.POLL_EMAIL_WHITELABEL,
                pattern: '17 * * * *', // Hourly, off the top of the hour
                options: {
                    backfillPeriod: 2 * 3600 * 1000, // 2 hours in ms
                    maxAttempts: 1,
                },
            },
            {
                task: SCHEDULER_TASKS.CLEAN_WAREHOUSE_CONNECT_CODES,
                pattern: '41 * * * *', // Hourly, off the top of the hour
                options: {
                    backfillPeriod: 2 * 3600 * 1000, // 2 hours in ms
                    maxAttempts: 3,
                },
            },
            // worker-process pg liveness is driven by a setInterval (see startPgPing);
            // managed-agent heartbeat is self-scheduling (see SchedulerClient.scheduleManagedAgentHeartbeat).
        ];
    }

    protected getTaskList(): Partial<TypedTaskList> {
        return Object.fromEntries(
            Object.entries(this.getFullTaskList()).filter(
                ([taskKey]) =>
                    isSchedulerTaskName(taskKey) &&
                    this.enabledTasks.includes(taskKey),
            ),
        ) as Partial<TypedTaskList>;
    }

    protected getFullTaskList(): TypedTaskList {
        return {
            [SCHEDULER_TASKS.GENERATE_DAILY_JOBS]: async () => {
                const currentDateStartOfDay = moment()
                    .utc()
                    .startOf('day')
                    .toDate();

                const schedulers = await this.schedulerService
                    .getAllSchedulers()
                    .catch((error: unknown) => {
                        this.prometheusMetrics?.recordSchedulerDailyJobGenerationError(
                            'load_schedulers',
                        );
                        throw error;
                    });

                const limit = pLimit(
                    this.lightdashConfig.scheduler
                        .dailyJobGenerationConcurrency,
                );
                const promises = schedulers.map((scheduler) =>
                    limit(() =>
                        this.generateDailyJobsForScheduler(
                            scheduler,
                            currentDateStartOfDay,
                        ),
                    ),
                );

                const results = await Promise.allSettled(promises);

                const successful = results.filter(
                    (result) => result.status === 'fulfilled',
                );

                const failed = results.filter(
                    (result) => result.status === 'rejected',
                );

                const failedSchedulerUuids = results.flatMap((result, index) =>
                    result.status === 'rejected'
                        ? [schedulers[index].schedulerUuid]
                        : [],
                );
                const failedSchedulerUuidsToLog = failedSchedulerUuids.slice(
                    0,
                    DAILY_JOB_FAILURE_SUMMARY_UUID_LIMIT,
                );
                const failedSchedulerUuidsLabel =
                    failedSchedulerUuids.length >
                    DAILY_JOB_FAILURE_SUMMARY_UUID_LIMIT
                        ? `${failedSchedulerUuids.length}, first ${DAILY_JOB_FAILURE_SUMMARY_UUID_LIMIT}`
                        : `${failedSchedulerUuids.length}`;
                Logger.info(
                    `Completed generating daily jobs: ${successful.length} successful, ${failed.length} failed out of ${schedulers.length} total schedulers. Failed scheduler UUIDs (${failedSchedulerUuidsLabel}): ${failedSchedulerUuidsToLog.join(', ') || 'none'}`,
                );

                // Log individual failures
                failed.forEach((result) => {
                    if (
                        result.reason instanceof GenerateDailySchedulerJobError
                    ) {
                        Logger.error(result.reason.message);
                    } else {
                        Logger.error(
                            'Scheduler job failed with unexpected error',
                            result.reason,
                        );
                    }
                });

                try {
                    await this.generateDailyPreAggregateMaterializationJobs(
                        currentDateStartOfDay,
                    );
                } catch (error) {
                    this.prometheusMetrics?.recordSchedulerDailyJobGenerationError(
                        'pre_aggregate',
                    );
                    Logger.error(
                        'Failed to generate pre-aggregate daily materialization jobs',
                        error,
                    );
                }

                // This heartbeat means the pass reached the end, not that every
                // scheduler succeeded. Alert on the error counter separately.
                this.prometheusMetrics?.recordSchedulerDailyJobGenerationCompleted();

                // Only throw if all schedulers failed
                if (failed.length > 0 && successful.length === 0) {
                    throw new Error(
                        'Failed to generate daily jobs for all schedulers',
                    );
                }
            },
            [SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY]: async (
                payload,
                helpers,
            ) => {
                const isFinalAttempt =
                    helpers.job.attempts >= helpers.job.max_attempts;
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.handleScheduledDelivery(
                                helpers.job.id,
                                helpers.job.run_at,
                                payload,
                                isFinalAttempt,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                            schedulerUuid: getSchedulerUuid(payload),
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.sendSlackNotification(
                                helpers.job.id,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.SEND_SLACK_NOTIFICATION,
                            schedulerUuid: payload.schedulerUuid,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            jobGroup: payload.jobGroup,
                            targetType: 'slack',
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.sendMsTeamsNotification(
                                helpers.job.id,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                            schedulerUuid: payload.schedulerUuid,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            jobGroup: payload.jobGroup,
                            targetType: 'msteams',
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.SEND_GOOGLE_CHAT_NOTIFICATION]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.SEND_GOOGLE_CHAT_NOTIFICATION,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.sendGoogleChatNotification(
                                helpers.job.id,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.SEND_GOOGLE_CHAT_NOTIFICATION,
                            schedulerUuid: payload.schedulerUuid,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            jobGroup: payload.jobGroup,
                            targetType: 'googlechat',
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.sendEmailNotification(
                                helpers.job.id,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.SEND_EMAIL_NOTIFICATION,
                            schedulerUuid: payload.schedulerUuid,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            jobGroup: payload.jobGroup,
                            targetType: 'email',
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
            // Batch notification handlers - one job per delivery type
            [SCHEDULER_TASKS.SEND_SLACK_BATCH_NOTIFICATION]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.SEND_SLACK_BATCH_NOTIFICATION,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.sendSlackBatchNotification(
                                helpers.job.id,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.SEND_SLACK_BATCH_NOTIFICATION,
                            schedulerUuid: payload.schedulerUuid,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            jobGroup: payload.jobGroup,
                            targetType: 'slack',
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.SEND_EMAIL_BATCH_NOTIFICATION]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.SEND_EMAIL_BATCH_NOTIFICATION,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.sendEmailBatchNotification(
                                helpers.job.id,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.SEND_EMAIL_BATCH_NOTIFICATION,
                            schedulerUuid: payload.schedulerUuid,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            jobGroup: payload.jobGroup,
                            targetType: 'email',
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.SEND_MSTEAMS_BATCH_NOTIFICATION]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.SEND_MSTEAMS_BATCH_NOTIFICATION,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.sendMsTeamsBatchNotification(
                                helpers.job.id,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.SEND_MSTEAMS_BATCH_NOTIFICATION,
                            schedulerUuid: payload.schedulerUuid,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            jobGroup: payload.jobGroup,
                            targetType: 'msteams',
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.SEND_GOOGLE_CHAT_BATCH_NOTIFICATION]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.SEND_GOOGLE_CHAT_BATCH_NOTIFICATION,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.sendGoogleChatBatchNotification(
                                helpers.job.id,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.SEND_GOOGLE_CHAT_BATCH_NOTIFICATION,
                            schedulerUuid: payload.schedulerUuid,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            jobGroup: payload.jobGroup,
                            targetType: 'googlechat',
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.UPLOAD_GSHEETS]: async (payload, helpers) => {
                const isFinalAttempt =
                    helpers.job.attempts >= helpers.job.max_attempts;
                try {
                    await tryJobOrTimeout(
                        SchedulerClient.processJob(
                            SCHEDULER_TASKS.UPLOAD_GSHEETS,
                            helpers.job.id,
                            helpers.job.run_at,
                            payload,
                            async () => {
                                await this.uploadGsheets(
                                    helpers.job.id,
                                    payload,
                                );
                            },
                        ),
                        helpers.job,
                        this.lightdashConfig.scheduler.jobTimeout,
                        async (job, e) => {
                            await this.schedulerService.logSchedulerJob({
                                task: SCHEDULER_TASKS.UPLOAD_GSHEETS,
                                schedulerUuid: payload.schedulerUuid,
                                jobId: job.id,
                                scheduledTime: job.run_at,
                                jobGroup: payload.jobGroup,
                                targetType: 'gsheets',
                                status: SchedulerJobStatus.ERROR,
                                details: {
                                    error: getErrorMessage(e),
                                    projectUuid: payload.projectUuid,
                                    organizationUuid: payload.organizationUuid,
                                    createdByUserUuid: payload.userUuid,
                                },
                            });
                        },
                    );
                } catch (e) {
                    const deliveryError =
                        e instanceof SchedulerDeliveryError ? e : undefined;
                    const action = resolveSchedulerDeliveryFailureAction(
                        deliveryError,
                        isFinalAttempt,
                    );

                    if (action.notify && deliveryError) {
                        await this.notifyGsheetsDeliveryFailure(
                            deliveryError,
                            helpers.job.id,
                        );
                    }

                    if (action.disable && deliveryError) {
                        await this.disableGsheetsScheduler(
                            payload.schedulerUuid,
                            deliveryError.createdByUserUuid,
                        );
                        return; // Swallow so graphile does not retry
                    }

                    // Re-throw the original error (not the envelope) so graphile
                    // and Sentry see the real type.
                    throw deliveryError ? deliveryError.cause : e;
                }
            },
            [SCHEDULER_TASKS.UPLOAD_GSHEET_FROM_QUERY]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.UPLOAD_GSHEET_FROM_QUERY,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.uploadGsheetFromQuery(
                                helpers.job.id,
                                helpers.job.run_at,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.UPLOAD_GSHEET_FROM_QUERY,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.CREATE_PROJECT_WITH_COMPILE]: async (
                payload,
                helpers,
            ) => {
                await SchedulerClient.processJob(
                    SCHEDULER_TASKS.CREATE_PROJECT_WITH_COMPILE,
                    helpers.job.id,
                    helpers.job.run_at,
                    payload,
                    async () => {
                        await this.createProjectWithCompile(
                            helpers.job.id,
                            helpers.job.run_at,
                            payload,
                        );
                    },
                );
            },
            [SCHEDULER_TASKS.COPY_PREVIEW_CONTENT]: async (
                payload,
                helpers,
            ) => {
                const controller = new AbortController();
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.COPY_PREVIEW_CONTENT,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            const user = await this.userService
                                .getSessionByUserUuid(payload.userUuid)
                                .catch(async (error) => {
                                    await this.projectService.failPreviewContentCopy(
                                        payload,
                                        error,
                                    );
                                    throw error;
                                });
                            await this.projectService.runPreviewContentCopy(
                                user,
                                payload,
                                controller.signal,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (_job, error) => {
                        controller.abort(error);
                        await this.projectService.failPreviewContentCopy(
                            payload,
                            error,
                        );
                    },
                );
            },
            [SCHEDULER_TASKS.COMPILE_PROJECT]: async (payload, helpers) => {
                await SchedulerClient.processJob(
                    SCHEDULER_TASKS.COMPILE_PROJECT,
                    helpers.job.id,
                    helpers.job.run_at,
                    payload,
                    async () => {
                        await this.compileProject(
                            helpers.job.id,
                            helpers.job.run_at,
                            payload,
                        );
                    },
                );
            },
            [SCHEDULER_TASKS.MATERIALIZE_PRE_AGGREGATE]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.MATERIALIZE_PRE_AGGREGATE,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.materializePreAggregate(
                                helpers.job.id,
                                helpers.job.run_at,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.MATERIALIZE_PRE_AGGREGATE,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                preAggregateDefinitionUuid:
                                    payload.preAggregateDefinitionUuid,
                                trigger: payload.trigger,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.TEST_AND_COMPILE_PROJECT]: async (
                payload,
                helpers,
            ) => {
                await SchedulerClient.processJob(
                    SCHEDULER_TASKS.TEST_AND_COMPILE_PROJECT,
                    helpers.job.id,
                    helpers.job.run_at,
                    payload,
                    async () => {
                        await this.testAndCompileProject(
                            helpers.job.id,
                            helpers.job.run_at,
                            payload,
                        );
                    },
                );
            },
            [SCHEDULER_TASKS.VALIDATE_PROJECT]: async (payload, helpers) => {
                await SchedulerClient.processJob(
                    SCHEDULER_TASKS.VALIDATE_PROJECT,
                    helpers.job.id,
                    helpers.job.run_at,
                    payload,
                    async () => {
                        await this.validateProject(
                            helpers.job.id,
                            helpers.job.run_at,
                            payload,
                        );
                    },
                );
            },
            [SCHEDULER_TASKS.SQL_RUNNER]: async (payload, helpers) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.SQL_RUNNER,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.sqlRunner(
                                helpers.job.id,
                                helpers.job.run_at,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.SQL_RUNNER,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.SQL_RUNNER_PIVOT_QUERY]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.SQL_RUNNER_PIVOT_QUERY,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.sqlRunnerPivotQuery(
                                helpers.job.id,
                                helpers.job.run_at,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.SQL_RUNNER_PIVOT_QUERY,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.INDEX_CATALOG]: async (payload, helpers) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.INDEX_CATALOG,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.indexCatalog(
                                helpers.job.id,
                                helpers.job.run_at,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.INDEX_CATALOG,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.BACKFILL_DEFAULT_USER_SPACES]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.BACKFILL_DEFAULT_USER_SPACES,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.backfillDefaultUserSpaces(
                                helpers.job.id,
                                helpers.job.run_at,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.BACKFILL_DEFAULT_USER_SPACES,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                userUuid: payload.userUuid,
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                createdByUserUuid: payload.userUuid,
                                error: e.message,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.LEARN_SANDBOX_COMMAND]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.LEARN_SANDBOX_COMMAND,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.learnSandboxCommand(
                                helpers.job.id,
                                helpers.job.run_at,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    LEARN_SANDBOX_COMMAND_TIMEOUT_MS + 30_000,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.LEARN_SANDBOX_COMMAND,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                commandUuid: payload.commandUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.REPLACE_CUSTOM_FIELDS]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.REPLACE_CUSTOM_FIELDS,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.replaceCustomFields(
                                helpers.job.id,
                                helpers.job.run_at,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.REPLACE_CUSTOM_FIELDS,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                userUuid: payload.userUuid,
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                error: getErrorMessage(e),
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.EXPORT_CSV_DASHBOARD]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.EXPORT_CSV_DASHBOARD,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.exportCsvDashboard(
                                helpers.job.id,
                                helpers.job.run_at,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.EXPORT_CSV_DASHBOARD,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                userUuid: payload.userUuid,
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                error: getErrorMessage(e),
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.EXPORT_CONTENT]: async (payload, helpers) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.EXPORT_CONTENT,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.exportContent(
                                helpers.job.id,
                                helpers.job.run_at,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.EXPORT_CONTENT,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                userUuid: payload.userUuid,
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                error: getErrorMessage(e),
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.RENAME_RESOURCES]: async (payload, helpers) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.RENAME_RESOURCES,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        () =>
                            this.renameResources(
                                helpers.job.id,
                                helpers.job.run_at,
                                payload,
                            ),
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.RENAME_RESOURCES,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                userUuid: payload.userUuid,
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                                error: getErrorMessage(e),
                                createdByUserUuid: payload.userUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.CLEAN_QUERY_HISTORY]: async () => {
                const cleanupConfig =
                    this.lightdashConfig.scheduler.queryHistory.cleanup;

                if (!cleanupConfig.enabled) {
                    Logger.info('Query history cleanup job is disabled');
                    return;
                }

                Logger.info('Starting query history cleanup job');

                const cutoffDate = moment()
                    .utc()
                    .subtract(cleanupConfig.retentionDays, 'days')
                    .toDate();

                Logger.info(
                    `Cleaning query history records older than ${cutoffDate.toISOString()}`,
                );

                try {
                    const { totalDeleted, batchCount } =
                        await this.asyncQueryService.queryHistoryModel.cleanupBatch(
                            cutoffDate,
                            cleanupConfig.batchSize,
                            cleanupConfig.delayMs,
                            cleanupConfig.maxBatches,
                        );

                    Logger.info(
                        `Query history cleanup completed. Total records deleted: ${totalDeleted} in ${batchCount} batches`,
                    );
                } catch (error) {
                    Logger.error('Error during query history cleanup:', error);
                    throw error;
                }

                // Also clean up pre-aggregate daily stats (3-day retention)
                try {
                    const preAggDeleted =
                        await this.asyncQueryService.cleanupPreAggregateDailyStats(
                            3,
                        );
                    Logger.info(
                        `Pre-aggregate daily stats cleanup completed. Records deleted: ${preAggDeleted}`,
                    );
                } catch (error) {
                    Logger.error(
                        'Error during pre-aggregate daily stats cleanup:',
                        error,
                    );
                    // Don't throw - this is secondary cleanup, don't fail the job
                }
            },
            [SCHEDULER_TASKS.CLEAN_DEPLOY_SESSIONS]: async () => {
                Logger.info('Starting deploy sessions cleanup job');

                try {
                    await this.deployService.cleanupOldSessions();

                    Logger.info(`Deploy sessions cleanup completed.`);
                } catch (error) {
                    Logger.error(
                        'Error during deploy sessions cleanup:',
                        error,
                    );
                    throw error;
                }
            },
            [SCHEDULER_TASKS.CLEAN_WAREHOUSE_CONNECT_CODES]: async () => {
                Logger.info('Starting warehouse connect codes cleanup job');

                try {
                    const deletedCount =
                        await this.warehouseConnectCodeModel.deleteExpired();

                    Logger.info(
                        `Warehouse connect codes cleanup completed. Deleted: ${deletedCount}`,
                    );
                } catch (error) {
                    Logger.error(
                        'Error during warehouse connect codes cleanup:',
                        error,
                    );
                    throw error;
                }
            },
            [SCHEDULER_TASKS.CLEAN_EXPIRED_PREVIEWS]: async () => {
                Logger.info('Starting expired preview projects cleanup job');

                try {
                    const deletedCount =
                        await this.projectService.deleteExpiredPreviewProjects();

                    Logger.info(
                        `Expired preview projects cleanup completed. Deleted: ${deletedCount}`,
                    );
                } catch (error) {
                    Logger.error(
                        'Error during expired preview projects cleanup:',
                        error,
                    );
                    throw error;
                }

                // The learn sandbox sweep is a separate housekeeping
                // concern (revoking stale PATs, clearing stale
                // workspaces): a failure here shouldn't be reported as a
                // failure of the (already-successful) preview projects
                // cleanup job above, nor prevent it from being marked done.
                try {
                    const swept = await this.learnSandboxService.sweep();
                    Logger.info(
                        `Learn sandbox sweep: ${swept.tokensDeleted} tokens, ${swept.workspacesRemoved} workspaces`,
                    );
                } catch (error) {
                    Logger.error(
                        `Learn sandbox sweep failed: ${getErrorMessage(error)}`,
                    );
                }
            },
            [SCHEDULER_TASKS.POLL_EMAIL_WHITELABEL]: async () => {
                Logger.info('Starting email whitelabel verification poll');
                try {
                    await this.emailWhitelabelService.pollPendingVerifications();
                    Logger.info('Email whitelabel verification poll completed');
                } catch (error) {
                    Logger.error(
                        'Error during email whitelabel verification poll:',
                        error,
                    );
                    throw error;
                }
            },
            [SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS]: async (
                payload,
                helpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.downloadAsyncQueryResults(
                                helpers.job.id,
                                helpers.job.run_at,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        await this.schedulerService.logSchedulerJob({
                            task: SCHEDULER_TASKS.DOWNLOAD_ASYNC_QUERY_RESULTS,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: getErrorMessage(e),
                                projectUuid: payload.projectUuid,
                                organizationUuid: payload.organizationUuid,
                            },
                        });
                    },
                );
            },
            [SCHEDULER_TASKS.SYNC_SLACK_CHANNELS]: async (payload, helpers) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.SYNC_SLACK_CHANNELS,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.syncSlackChannels(
                                helpers.job.id,
                                payload,
                            );
                        },
                    ),
                    helpers.job,
                    this.lightdashConfig.scheduler.jobTimeout,
                    async (job, e) => {
                        Logger.error(
                            `Slack channel sync failed for organization ${
                                payload.organizationUuid
                            }: ${getErrorMessage(e)}`,
                        );
                    },
                );
            },
            [SCHEDULER_TASKS.GENERATE_SLACK_CHANNEL_SYNC_JOBS]: async (
                _payload,
                helpers,
            ) => {
                if (!this.slackClient.isEnabled) {
                    Logger.info(
                        'Skipping Slack channel sync generation: Slack is not configured',
                    );
                    return;
                }

                Logger.info('Starting daily Slack channel sync job generation');

                // Get all organizations with Slack installations
                const organizationUuids =
                    await this.slackClient.getAllOrganizationsWithSlack();

                Logger.info(
                    `Found ${organizationUuids.length} organizations with Slack installations`,
                );

                // Queue sync jobs for each organization
                const results = await Promise.allSettled(
                    organizationUuids.map(async (organizationUuid) => {
                        await this.schedulerClient.syncSlackChannelsJob({
                            organizationUuid,
                            userUuid: undefined,
                            projectUuid: undefined,
                            schedulerUuid: undefined,
                        });
                        return organizationUuid;
                    }),
                );

                const successful = results.filter(
                    (r) => r.status === 'fulfilled',
                ).length;
                const failed = results.filter(
                    (r) => r.status === 'rejected',
                ).length;

                Logger.info(
                    `Completed generating Slack channel sync jobs: ${successful} successful, ${failed} failed out of ${organizationUuids.length} total`,
                );
            },
            [SCHEDULER_TASKS.CHECK_FOR_STUCK_JOBS]: async () => {
                await this.schedulerService.checkForStuckJobs();
            },
            [SCHEDULER_TASKS.COMPACT_USAGE_EVENTS]: async () => {
                const { usageEvents } = this.lightdashConfig;
                if (!usageEvents.enabled || usageEvents.s3 === null) {
                    Logger.debug(
                        'Usage events compaction skipped: usage events are not enabled',
                    );
                    return;
                }
                const compactor = new UsageEventsCompactor({
                    s3Config: usageEvents.s3,
                    prometheusMetrics: this.prometheusMetrics,
                    usageDimensionsModel: this.usageDimensionsModel,
                });
                const summary = await compactor.run();
                Sentry.getActiveSpan()?.setAttributes({
                    'lightdash.usage_events.partitions_discovered':
                        summary.partitionsDiscovered,
                    'lightdash.usage_events.partitions_compacted':
                        summary.partitionsCompacted,
                    'lightdash.usage_events.partitions_failed':
                        summary.partitionsFailed,
                    'lightdash.usage_events.partitions_skipped_unknown_stream':
                        summary.partitionsSkippedUnknownStream,
                    'lightdash.usage_events.raw_objects_deleted':
                        summary.rawObjectsDeleted,
                });
            },
            [SCHEDULER_TASKS.MANAGED_AGENT_HEARTBEAT]: async () => {
                // EE-only: implemented in CommercialSchedulerWorker
            },
            [SCHEDULER_TASKS.INGEST_PROJECT_CONTEXT]: async () => {
                // EE-only: implemented in CommercialSchedulerWorker
            },
        };
    }
}
