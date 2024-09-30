import {
    SchedulerJobStatus,
    semanticLayerQueryJob,
    sqlRunnerJob,
    sqlRunnerPivotQueryJob,
} from '@lightdash/common';
import { getSchedule, stringToArray } from 'cron-converter';
import {
    JobHelpers,
    Logger as GraphileLogger,
    parseCronItems,
    run as runGraphileWorker,
    Runner,
    Task,
    TaskList,
} from 'graphile-worker';
import moment from 'moment';
import Logger from '../logging/logger';
import { wrapSentryTransaction } from '../utils';
import { SchedulerClient } from './SchedulerClient';
import { tryJobOrTimeout } from './SchedulerJobTimeout';
import SchedulerTask from './SchedulerTask';
import schedulerWorkerEventEmitter from './SchedulerWorkerEventEmitter';

const traceTask = (taskName: string, task: Task): Task => {
    const tracedTask: Task = async (payload, helpers) => {
        await wrapSentryTransaction(
            `worker.task.${taskName}`,
            {},
            async (span) => {
                const { job } = helpers;

                // TODO: have clearer types for payload
                let organizationUuidAttribute = {};
                if (
                    typeof payload === 'object' &&
                    payload !== null &&
                    'organizationUuid' in payload
                ) {
                    organizationUuidAttribute = {
                        'worker.task.organization_id': payload.organizationUuid,
                    };
                }

                span.setAttributes({
                    'worker.task.name': taskName,
                    'worker.job.id': job.id,
                    'worker.job.task_identifier': job.task_identifier,
                    'worker.job.attempts': job.attempts,
                    'worker.job.max_attempts': job.max_attempts,
                    ...organizationUuidAttribute,
                });
                if (job.locked_at) {
                    span.setAttribute(
                        'worker.job.locked_at',
                        moment(job.locked_at).toISOString(),
                    );
                }
                if (job.created_at) {
                    span.setAttribute(
                        'worker.job.created_at',
                        job.created_at.toISOString(),
                    );
                }
                if (job.locked_by) {
                    span.setAttribute('worker.job.locked_by', job.locked_by);
                }
                if (job.key) {
                    span.setAttribute('worker.job.key', job.key);
                }

                let hasError = false;
                try {
                    await task(payload, helpers);
                } catch (e) {
                    hasError = true;

                    span.setStatus({
                        code: 2, // Error
                    });
                    throw e;
                }
            },
        );
    };
    return tracedTask;
};

const traceTasks = (tasks: TaskList) => {
    const tracedTasks = Object.keys(tasks).reduce<TaskList>(
        (accTasks, taskName) => ({
            ...accTasks,
            [taskName]: traceTask(taskName, tasks[taskName]),
        }),
        {} as TaskList,
    );
    return tracedTasks;
};

export const getDailyDatesFromCron = (
    cron: string,
    when = new Date(),
): Date[] => {
    const arr = stringToArray(cron);
    const startOfMinute = moment(when).startOf('minute').toDate(); // round down to the nearest minute so we can even process 00:00 on daily jobs
    const schedule = getSchedule(arr, startOfMinute, 'UTC');
    const tomorrow = moment(startOfMinute)
        .add(1, 'day')
        .startOf('day')
        .toDate();
    const dailyDates: Date[] = [];
    while (schedule.next() < tomorrow) {
        dailyDates.push(schedule.date.toJSDate());
    }
    return dailyDates;
};

const workerLogger = new GraphileLogger((scope) => (_, message, meta) => {
    Logger.debug(message, { meta, scope });
});

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
                        maxAttempts: 1,
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

    protected getTaskList(): TaskList {
        return {
            generateDailyJobs: async () => {
                const schedulers =
                    await this.schedulerService.getAllSchedulers();
                const promises = schedulers.map(async (scheduler) => {
                    await this.schedulerClient.generateDailyJobsForScheduler(
                        scheduler,
                    );
                });

                await Promise.all(promises);
            },

            handleScheduledDelivery: async (
                payload: any,
                helpers: JobHelpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        'handleScheduledDelivery',
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
                            task: 'handleScheduledDelivery',
                            schedulerUuid: payload.schedulerUuid,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            jobGroup: payload.jobGroup,
                            status: SchedulerJobStatus.ERROR,
                            details: { error: e.message },
                        });
                    },
                );
            },
            sendSlackNotification: async (
                payload: any,
                helpers: JobHelpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        'sendSlackNotification',
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
                            task: 'sendSlackNotification',
                            schedulerUuid: payload.schedulerUuid,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            jobGroup: payload.jobGroup,
                            targetType: 'slack',
                            status: SchedulerJobStatus.ERROR,
                            details: { error: e.message },
                        });
                    },
                );
            },
            sendEmailNotification: async (
                payload: any,
                helpers: JobHelpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        'sendEmailNotification',
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
                            task: 'sendEmailNotification',
                            schedulerUuid: payload.schedulerUuid,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            jobGroup: payload.jobGroup,
                            targetType: 'email',
                            status: SchedulerJobStatus.ERROR,
                            details: { error: e.message },
                        });
                    },
                );
            },
            uploadGsheets: async (payload: any, helpers: JobHelpers) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        'uploadGsheets',
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
                            task: 'uploadGsheets',
                            schedulerUuid: payload.schedulerUuid,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            jobGroup: payload.jobGroup,
                            targetType: 'gsheets',
                            status: SchedulerJobStatus.ERROR,
                            details: { error: e.message },
                        });
                    },
                );
            },
            downloadCsv: async (payload: any, helpers: JobHelpers) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        'downloadCsv',
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
                            task: 'downloadCsv',
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: e.message,
                            },
                        });
                    },
                );
            },
            uploadGsheetFromQuery: async (
                payload: any,
                helpers: JobHelpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        'uploadGsheetFromQuery',
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
                            task: 'uploadGsheetFromQuery',
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: e.message,
                            },
                        });
                    },
                );
            },
            compileProject: async (payload: any, helpers: JobHelpers) => {
                await SchedulerClient.processJob(
                    'compileProject',
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
            testAndCompileProject: async (
                payload: any,
                helpers: JobHelpers,
            ) => {
                await SchedulerClient.processJob(
                    'testAndCompileProject',
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
            validateProject: async (payload: any, helpers: JobHelpers) => {
                await SchedulerClient.processJob(
                    'validateProject',
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
            [sqlRunnerJob]: async (payload: any, helpers: JobHelpers) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        sqlRunnerJob,
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
                            task: sqlRunnerJob,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: e.message,
                            },
                        });
                    },
                );
            },
            [sqlRunnerPivotQueryJob]: async (
                payload: any,
                helpers: JobHelpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        sqlRunnerPivotQueryJob,
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
                            task: sqlRunnerPivotQueryJob,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: e.message,
                            },
                        });
                    },
                );
            },
            [semanticLayerQueryJob]: async (
                payload: any,
                helpers: JobHelpers,
            ) => {
                await tryJobOrTimeout(
                    SchedulerClient.processJob(
                        semanticLayerQueryJob,
                        helpers.job.id,
                        helpers.job.run_at,
                        payload,
                        async () => {
                            await this.semanticLayerQuery(
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
                            task: semanticLayerQueryJob,
                            jobId: job.id,
                            scheduledTime: job.run_at,
                            status: SchedulerJobStatus.ERROR,
                            details: {
                                createdByUserUuid: payload.userUuid,
                                error: e.message,
                            },
                        });
                    },
                );
            },
        };
    }
}
