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
} from 'graphile-worker';
import moment from 'moment';
import { DEFAULT_DB_MAX_CONNECTIONS } from '../knexfile';
import Logger from '../logging/logger';
import { SchedulerClient } from './SchedulerClient';
import { tryJobOrTimeout } from './SchedulerJobTimeout';
import SchedulerTask, { type SchedulerTaskArguments } from './SchedulerTask';
import { traceTasks } from './SchedulerTaskTracer';
import schedulerWorkerEventEmitter from './SchedulerWorkerEventEmitter';
import { TypedTaskList } from './types';

const workerLogger = new GraphileLogger(
    (scope) => (logLevel, message, meta) => {
        if (logLevel === 'error') {
            return Logger.error(message, { meta, scope });
        }

        return Logger.debug(message, { meta, scope });
    },
);

export class SchedulerWorker extends SchedulerTask {
    runner: Runner | undefined;

    isRunning: boolean = false;

    enabledTasks: Array<SchedulerTaskName>;

    constructor(schedulerTaskArgs: SchedulerTaskArguments & {}) {
        super(schedulerTaskArgs);
        this.enabledTasks = this.lightdashConfig.scheduler.tasks;
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
            pollInterval: 1000,
            maxPoolSize,
            parsedCronItems: parseCronItems([
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
            ]),
            taskList: traceTasks(this.getTaskList()),
            events: schedulerWorkerEventEmitter,
        });

        this.isRunning = true;
        // Don't await this! This promise will never resolve, as the worker will keep running until the process is killed
        this.runner.promise.finally(() => {
            this.isRunning = false;
        });
    }

    protected getTaskList(): Partial<TypedTaskList> {
        return Object.fromEntries(
            Object.entries(this.getFullTaskList()).filter(
                ([taskKey]) =>
                    isSchedulerTaskName(taskKey) &&
                    this.enabledTasks.includes(taskKey),
            ),
        );
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
                            await this.schedulerService.getCreateSchedulerResource(
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
            [SCHEDULER_TASKS.DOWNLOAD_CSV]: async (payload, helpers) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        SCHEDULER_TASKS.DOWNLOAD_CSV,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.downloadCsv(
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
                            task: SCHEDULER_TASKS.DOWNLOAD_CSV,
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
        };
    }
}
