import {
    GenerateDailySchedulerJobError,
    getErrorMessage,
    getSchedulerUuid,
    isSchedulerTaskName,
    SCHEDULER_TASKS,
    SchedulerJobStatus,
    type SchedulerTaskName,
} from '@lightdash/common';
import {
    Logger as GraphileLogger,
    parseCronItems,
    run as runGraphileWorker,
    Runner,
    type CronItem,
    type JobHelpers,
} from 'graphile-worker';
import moment from 'moment';
import { DEFAULT_DB_MAX_CONNECTIONS } from '../knexfile';
import Logger from '../logging/logger';
import { SchedulerClient } from './SchedulerClient';
import { tryJobOrTimeout } from './SchedulerJobTimeout';
import SchedulerTask, { type SchedulerTaskArguments } from './SchedulerTask';
import { traceTasks } from './SchedulerTaskTracer';
import schedulerWorkerEventEmitter from './SchedulerWorkerEventEmitter';
import { SchedulerWorkerHealth } from './SchedulerWorkerHealth';
import { TypedTaskList } from './types';

export type SchedulerWorkerArguments = SchedulerTaskArguments & {
    workerHealth: SchedulerWorkerHealth;
};

const workerLogger = new GraphileLogger(
    (scope) => (logLevel, message, meta) => {
        if (logLevel === 'error') {
            return Logger.error(message, { meta, scope });
        }

        return Logger.debug(message, { meta, scope });
    },
);

// Per-pool heartbeat enqueue cadence. The probe's job-activity staleness
// threshold is 3 minutes, so a 60s tick gives 3x headroom for queue
// insert -> LISTEN dispatch -> handler latency.
const HEARTBEAT_ENQUEUE_INTERVAL_MS = 60_000;

// Per-pool heartbeat task name prefix. The full task name appended with the
// pool id (e.g. workerHeartbeat:scheduler-app) is registered only in that
// pool's task list, so only that pool's runner processes its own heartbeat.
// This makes the job-activity probe signal a true proof of THIS pool's
// insert -> LISTEN -> handler pipeline, not a contention race with other
// pools sharing the queue.
const PER_POOL_HEARTBEAT_TASK_PREFIX = 'workerHeartbeat:';

export class SchedulerWorker extends SchedulerTask {
    runner: Runner | undefined;

    isRunning: boolean = false;

    enabledTasks: Array<SchedulerTaskName>;

    protected readonly workerHealth: SchedulerWorkerHealth;

    private heartbeatEnqueueInterval: NodeJS.Timeout | null = null;

    constructor(schedulerWorkerArgs: SchedulerWorkerArguments) {
        super(schedulerWorkerArgs);
        this.enabledTasks = this.lightdashConfig.scheduler.tasks;
        this.workerHealth = schedulerWorkerArgs.workerHealth;
    }

    private get heartbeatTaskName(): string {
        return `${PER_POOL_HEARTBEAT_TASK_PREFIX}${this.workerHealth.getPoolId()}`;
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
        const maxPoolSize = Math.min(desiredPoolSize, dbMaxConnections);

        this.runner = await runGraphileWorker({
            connectionString: this.lightdashConfig.database.connectionUri,
            logger: workerLogger,
            concurrency: this.lightdashConfig.scheduler.concurrency,
            noHandleSignals: true,
            pollInterval: this.lightdashConfig.scheduler.pollInterval,
            maxPoolSize,
            parsedCronItems: parseCronItems(this.getCronItems()),
            taskList: traceTasks(this.getTaskList()),
            events: schedulerWorkerEventEmitter,
        });

        this.isRunning = true;
        this.startHeartbeatEnqueue();
        // Don't await this! This promise will never resolve, as the worker will keep running until the process is killed
        void this.runner.promise.finally(() => {
            this.isRunning = false;
            this.stopHeartbeatEnqueue();
        });
    }

    // Per-pool heartbeat strategy: every interval this pool inserts a job
    // with a task name unique to itself (workerHeartbeat:<poolId>). Only this
    // pool's task list registers a handler for that name, so only this pool's
    // runner can fetch and execute it. The handler is a no-op — its purpose is
    // to fire the job:start event listener (wireWorkerHealthEvents) which calls
    // markJobActivity('job-event'). End result: lastJobActivityAt is a true
    // signal that THIS pool's insert -> LISTEN -> handler pipeline is alive.
    //
    // If the pipeline breaks (e.g. corrupted pg client after Cloud SQL
    // failover, the original incident this PR is meant to detect), the enqueue
    // still succeeds but the job is never processed -> lastJobActivityAt ages
    // past staleness -> probe trips -> kubelet restarts the pod.
    //
    // jobKey deduplicates: if the previous heartbeat is still pending, the new
    // enqueue replaces its run_at rather than creating a second job. So a dead
    // pool leaves at most ONE stale workerHeartbeat:* row in the queue.
    private startHeartbeatEnqueue() {
        if (this.heartbeatEnqueueInterval) return;
        void this.enqueueOwnHeartbeat();
        this.heartbeatEnqueueInterval = setInterval(() => {
            void this.enqueueOwnHeartbeat();
        }, HEARTBEAT_ENQUEUE_INTERVAL_MS);
        Logger.info(
            `[scheduler-health] heartbeat-enqueue started poolId=${this.workerHealth.getPoolId()} taskName=${this.heartbeatTaskName} intervalMs=${HEARTBEAT_ENQUEUE_INTERVAL_MS}`,
        );
    }

    private stopHeartbeatEnqueue() {
        if (this.heartbeatEnqueueInterval) {
            clearInterval(this.heartbeatEnqueueInterval);
            this.heartbeatEnqueueInterval = null;
            Logger.info(
                `[scheduler-health] heartbeat-enqueue stopped poolId=${this.workerHealth.getPoolId()}`,
            );
        }
    }

    private async enqueueOwnHeartbeat() {
        try {
            const graphileClient = await this.schedulerClient.graphileUtils;
            await graphileClient.addJob(
                this.heartbeatTaskName,
                {
                    poolId: this.workerHealth.getPoolId(),
                    enqueuedAt: new Date().toISOString(),
                },
                {
                    // jobKey deduplicates so we never accumulate orphaned
                    // heartbeats — at most one pending row per pool.
                    jobKey: this.heartbeatTaskName,
                    maxAttempts: 1,
                },
            );
            Logger.debug(
                `[scheduler-health] heartbeat-enqueued poolId=${this.workerHealth.getPoolId()}`,
            );
        } catch (e) {
            // Enqueue failure is itself a signal — DB write path is broken.
            // We log and let the next tick retry; if every tick fails for 3
            // min, lastJobActivityAt will not refresh and the probe will trip.
            Logger.warn(
                `[scheduler-health] heartbeat-enqueue-failed poolId=${this.workerHealth.getPoolId()} error=${getErrorMessage(
                    e,
                )}`,
            );
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
            // workerHeartbeat is NOT a cron item — it's driven by a per-pool
            // setInterval (see startSelfBeat). A cron-scheduled heartbeat can
            // only be processed by ONE pool when multiple pools share the
            // queue, which flaps the unlucky pool's probe to 503.
            //
            // Managed agent heartbeat is self-scheduling (not a static cron).
            // See SchedulerClient.scheduleManagedAgentHeartbeat().
        ];
    }

    protected getTaskList(): Partial<TypedTaskList> {
        const filteredTaskList = Object.fromEntries(
            Object.entries(this.getFullTaskList()).filter(
                ([taskKey]) =>
                    isSchedulerTaskName(taskKey) &&
                    this.enabledTasks.includes(taskKey),
            ),
        );
        // Register the per-pool heartbeat handler. The task name is dynamic
        // (workerHeartbeat:<poolId>) so it isn't in SchedulerTaskName — cast
        // the merged map to satisfy the typed shape. Only this pool registers
        // this exact task name, so only this pool's runner can process it.
        return {
            ...filteredTaskList,
            [this.heartbeatTaskName]: (async () => {
                // No-op handler. Activity tracking happens via the job:start
                // listener wired in wireWorkerHealthEvents. Successful execution
                // of THIS specific task name proves this pool's full insert ->
                // LISTEN -> handler pipeline is alive.
            }) as TypedTaskList[keyof TypedTaskList],
        } as Partial<TypedTaskList>;
    }

    protected getFullTaskList(): TypedTaskList {
        return {
            [SCHEDULER_TASKS.GENERATE_DAILY_JOBS]: async () => {
                const currentDateStartOfDay = moment()
                    .utc()
                    .startOf('day')
                    .toDate();

                const schedulers =
                    await this.schedulerService.getAllSchedulers();

                const promises = schedulers.map(async (scheduler) => {
                    try {
                        const defaultTimezone =
                            await this.schedulerService.getSchedulerDefaultTimezone(
                                scheduler.schedulerUuid,
                            );
                        const { organizationUuid, projectUuid } =
                            await this.schedulerService.getSchedulerProjectContext(
                                scheduler,
                            );

                        await this.schedulerClient.generateDailyJobsForScheduler(
                            scheduler,
                            {
                                organizationUuid,
                                projectUuid,
                                userUuid: scheduler.createdBy,
                            },
                            defaultTimezone,
                            currentDateStartOfDay,
                        );
                        return scheduler.schedulerUuid;
                    } catch (error) {
                        throw new GenerateDailySchedulerJobError(
                            `Failed to generate daily jobs for scheduler ${scheduler.schedulerUuid} with: ${error}`,
                            scheduler.schedulerUuid,
                            error,
                        );
                    }
                });

                const results = await Promise.allSettled(promises);

                const successful = results.filter(
                    (result) => result.status === 'fulfilled',
                );

                const failed = results.filter(
                    (result) => result.status === 'rejected',
                );

                Logger.info(
                    `Completed generating daily jobs: ${successful.length} successful, ${failed.length} failed out of ${schedulers.length} total schedulers`,
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
                    Logger.error(
                        'Failed to generate pre-aggregate daily materialization jobs',
                        error,
                    );
                }

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
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.UPLOAD_GSHEETS,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.uploadGsheets(helpers.job.id, payload);
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
            [SCHEDULER_TASKS.MANAGED_AGENT_HEARTBEAT]: async () => {
                // EE-only: implemented in CommercialSchedulerWorker
            },
            // No-op handler retained so manual enqueues (e.g. operator
            // inserting a workerHeartbeat job to test queue throughput) still
            // process cleanly. Activity tracking is handled by the self-beat
            // interval plus the wireWorkerHealthEvents job-event listeners.
            [SCHEDULER_TASKS.WORKER_HEARTBEAT]: async () => {},
        };
    }
}
