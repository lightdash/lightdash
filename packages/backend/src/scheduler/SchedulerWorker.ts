import {
    getErrorMessage,
    getSchedulerUuid,
    SCHEDULER_TASKS,
    SchedulerJobStatus,
} from '@lightdash/common';
import {
    Logger as GraphileLogger,
    parseCronItems,
    run as runGraphileWorker,
    Runner,
} from 'graphile-worker';
import moment from 'moment';
import Logger from '../logging/logger';
import { SchedulerClient } from './SchedulerClient';
import { tryJobOrTimeout } from './SchedulerJobTimeout';
import SchedulerTask from './SchedulerTask';
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

    async run() {
        // Wait for graphile utils to finish migration and prevent race conditions
        await this.schedulerClient.graphileUtils;
        // Run a worker to execute jobs:
        Logger.info('Running scheduler');

        this.runner = await runGraphileWorker({
            connectionString: this.lightdashConfig.database.connectionUri,
            logger: workerLogger,
            concurrency: this.lightdashConfig.scheduler?.concurrency,
            noHandleSignals: true,
            pollInterval: 1000,
            parsedCronItems: parseCronItems([
                {
                    task: 'generateDailyJobs',
                    pattern: '0 0 * * *',
                    options: {
                        backfillPeriod: 12 * 3600 * 1000, // 12 hours in ms
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

    protected getTaskList(): TypedTaskList {
        return {
            [SCHEDULER_TASKS.GENERATE_DAILY_JOBS]: async () => {
                const currentDateStartOfDay = moment()
                    .utc()
                    .startOf('day')
                    .toDate();

                const schedulers =
                    await this.schedulerService.getAllSchedulers();

                const promises = schedulers.map(async (scheduler) => {
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
                });

                await Promise.all(promises);
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
        };
    }
}
