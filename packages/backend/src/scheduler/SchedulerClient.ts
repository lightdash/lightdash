import {
    AnyType,
    CompileProjectPayload,
    CreateSchedulerAndTargets,
    CreateSchedulerTarget,
    DownloadCsvPayload,
    EmailNotificationPayload,
    GsheetsNotificationPayload,
    JobPriority,
    MsTeamsNotificationPayload,
    NotificationPayloadBase,
    QueueTraceProperties,
    ReplaceCustomFieldsPayload,
    SCHEDULER_TASKS,
    ScheduledDeliveryPayload,
    ScheduledJobs,
    Scheduler,
    SchedulerAndTargets,
    SchedulerFormat,
    SchedulerJobStatus,
    SchedulerTaskName,
    SlackNotificationPayload,
    SqlRunnerPayload,
    SqlRunnerPivotQueryPayload,
    TaskPayloadMap,
    TraceTaskBase,
    UploadMetricGsheetPayload,
    ValidateProjectPayload,
    getSchedulerTargetUuid,
    getSchedulerUuid,
    hasSchedulerUuid,
    isCreateScheduler,
    isCreateSchedulerMsTeamsTarget,
    isCreateSchedulerSlackTarget,
    type SchedulerCreateProjectWithCompilePayload,
    type SchedulerIndexCatalogJobPayload,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { getSchedule, stringToArray } from 'cron-converter';
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker';
import moment from 'moment';
import { nanoid } from 'nanoid';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import { SchedulerModel } from '../models/SchedulerModel';

type SchedulerClientArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    schedulerModel: SchedulerModel;
};

const SCHEDULED_JOB_MAX_ATTEMPTS = 1;

export const getDailyDatesFromCron = (
    {
        cron,
        timezone,
    }: {
        cron: string;
        timezone: string;
    },
    when = new Date(),
): Date[] => {
    const arr = stringToArray(cron);
    const startOfMinute = moment(when).startOf('minute').toDate(); // round down to the nearest minute so we can even process 00:00 on daily jobs
    const schedule = getSchedule(arr, startOfMinute, timezone);
    const tomorrow = moment(startOfMinute)
        .utc()
        .add(1, 'day')
        .startOf('day')
        .toDate();

    const dailyDates: Date[] = [];
    while (schedule.next() < tomorrow) {
        dailyDates.push(schedule.date.toJSDate());
    }

    return dailyDates;
};

export class SchedulerClient {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    graphileUtils: Promise<WorkerUtils>;

    schedulerModel: SchedulerModel;

    constructor({
        lightdashConfig,
        analytics,
        schedulerModel,
    }: SchedulerClientArguments) {
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.schedulerModel = schedulerModel;
        this.graphileUtils = makeWorkerUtils({
            connectionString: lightdashConfig.database.connectionUri,
        })
            .then((utils) => utils)
            .catch((e: AnyType) => {
                Logger.error('Error migrating graphile worker', e);
                process.exit(1);
            });
    }

    static async processJob<T extends SchedulerTaskName>(
        task: T,
        jobId: string,
        runAt: Date,
        payload: TaskPayloadMap[T],
        funct: () => Promise<void>,
    ) {
        const { traceHeader, baggageHeader, sentryMessageId } =
            payload as unknown as QueueTraceProperties;

        const latency = Date.now() - runAt.getTime();
        return new Promise<void>((resolve, reject) => {
            Sentry.continueTrace(
                { sentryTrace: traceHeader, baggage: baggageHeader },
                async () => {
                    await Sentry.startSpan(
                        {
                            name: 'queue_consumer_transaction',
                            op: task,
                        },
                        async (parent) => {
                            await Sentry.startSpan(
                                {
                                    name: 'queue_consumer',
                                    op: 'queue.process',
                                    attributes: {
                                        'messaging.message.id': sentryMessageId,
                                        'messaging.destination.name': task,
                                        'messaging.message.body.size':
                                            Buffer.byteLength(
                                                JSON.stringify(payload),
                                            ),
                                        'messaging.message.receive.latency':
                                            latency,
                                        'messaging.message.retry.count': 0,
                                        'messaging.message.job.id': `${jobId}`,
                                    },
                                },
                                async (span) => {
                                    const OK = 1;
                                    const ERROR = 2;
                                    try {
                                        await funct();

                                        parent.setStatus({ code: OK });

                                        resolve();
                                    } catch (e) {
                                        parent.setStatus({
                                            code: ERROR,
                                            message: `Unable to process job ${e}`,
                                        });
                                        reject(e);
                                        throw e;
                                    }
                                },
                            );
                        },
                    );
                },
            ).catch((e) => {
                reject(e);
            });
        });
    }

    private static async addJob<T extends SchedulerTaskName>(
        graphileClient: WorkerUtils,
        identifier: T,
        payload: TaskPayloadMap[T],
        scheduledAt: Date,
        priority: JobPriority,
        maxAttempts: number = SCHEDULED_JOB_MAX_ATTEMPTS,
    ) {
        const messageId = nanoid();
        const jobId = await Sentry.startSpan(
            {
                name: 'queue_producer',
                op: 'queue.publish',
                attributes: {
                    'messaging.message.id': messageId,
                    'messaging.destination.name': identifier,
                    'messaging.message.body.size': Buffer.byteLength(
                        JSON.stringify(payload),
                    ),
                },
            },
            async (span) => {
                const traceHeader = Sentry.spanToTraceHeader(span);
                const baggageHeader = Sentry.spanToBaggageHeader(span);
                const payloadWithSentryHeaders: TaskPayloadMap[T] &
                    QueueTraceProperties = {
                    ...payload,
                    traceHeader,
                    baggageHeader,
                    sentryMessageId: messageId,
                };
                const { id } = await graphileClient.addJob(
                    identifier,
                    payloadWithSentryHeaders,
                    {
                        runAt: scheduledAt,
                        maxAttempts,
                        priority,
                    },
                );

                return id;
            },
        );
        return jobId;
    }

    async getScheduledJobs(schedulerUuid: string): Promise<ScheduledJobs[]> {
        const graphileClient = await this.graphileUtils;

        const scheduledJobs = await graphileClient.withPgClient((pgClient) =>
            pgClient.query(
                "select id, run_at from graphile_worker.jobs where payload->>'schedulerUuid' = $1",
                [schedulerUuid],
            ),
        );
        return scheduledJobs.rows.map((r) => ({
            id: r.id,
            date: r.run_at,
        }));
    }

    async getQueueSize(): Promise<number> {
        const graphileClient = await this.graphileUtils;
        const results = await graphileClient.withPgClient((pgClient) =>
            pgClient.query(
                'select count(id) as count from graphile_worker.jobs where attempts <> max_attempts AND run_at < now()',
            ),
        );
        return parseInt(results.rows[0].count, 10);
    }

    async deleteScheduledJobs(schedulerUuid: string): Promise<void> {
        const graphileClient = await this.graphileUtils;
        const jobsToDelete = await this.getScheduledJobs(schedulerUuid);
        Logger.info(
            `Deleting ${jobsToDelete.length} scheduled delivery jobs for scheduler ${schedulerUuid}`,
        );
        const jobIdsToDelete = jobsToDelete.map((r) => r.id);

        await graphileClient.completeJobs(jobIdsToDelete);

        jobsToDelete.forEach(({ id }) => {
            this.analytics.track({
                event: 'scheduler_job.deleted',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId: id,
                    schedulerId: schedulerUuid,
                },
            });
        });
    }

    async addScheduledDeliveryJob(
        date: Date,
        scheduler: ScheduledDeliveryPayload,
        schedulerUuid: string | undefined, // This detects if a scheduled delivery is to be sent "now"
    ) {
        const graphileClient = await this.graphileUtils;

        const traceProperties: TraceTaskBase = {
            organizationUuid: scheduler.organizationUuid,
            projectUuid: scheduler.projectUuid,
            userUuid: scheduler.userUuid,
        };

        const payload: ScheduledDeliveryPayload = schedulerUuid
            ? {
                  schedulerUuid,
                  ...traceProperties,
              }
            : scheduler;

        let maxAttempts = SCHEDULED_JOB_MAX_ATTEMPTS;
        if (
            isCreateScheduler(scheduler) &&
            scheduler.format === SchedulerFormat.IMAGE &&
            !!scheduler.dashboardUuid
        ) {
            maxAttempts = SCHEDULED_JOB_MAX_ATTEMPTS + 1;
        }

        const id = await SchedulerClient.addJob(
            graphileClient,
            SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
            payload,
            date,
            JobPriority.LOW,
            maxAttempts,
        );
        await this.schedulerModel.logSchedulerJob({
            task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
            schedulerUuid,
            jobGroup: id,
            jobId: id,
            scheduledTime: date,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                projectUuid: scheduler.projectUuid,
                organizationUuid: scheduler.organizationUuid,
                createdByUserUuid: scheduler.userUuid,
            },
        });
        this.analytics.track({
            event: 'scheduler_job.created',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId: id,
                schedulerId: schedulerUuid,
            },
        });

        return { jobId: id, date };
    }

    private async addGsheetsUploadJob(
        date: Date,
        jobGroup: string,
        scheduler: Scheduler,
        traceProperties: TraceTaskBase,
    ) {
        const graphileClient = await this.graphileUtils;

        const payload: GsheetsNotificationPayload = {
            schedulerUuid: scheduler.schedulerUuid,
            jobGroup,
            scheduledTime: date,
            ...traceProperties,
        };
        const id = await SchedulerClient.addJob(
            graphileClient,
            SCHEDULER_TASKS.UPLOAD_GSHEETS,
            payload,
            date,
            JobPriority.LOW,
        );

        this.analytics.track({
            event: 'scheduler_notification_job.created',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId: id,
                schedulerId: scheduler.schedulerUuid,
                schedulerTargetId: undefined,
                type: 'gsheets',
                format: scheduler.format,
                sendNow: scheduler.schedulerUuid === undefined,
            },
        });
        return { jobId: id };
    }

    private async addNotificationJob(
        date: Date,
        jobGroup: string,
        scheduler: SchedulerAndTargets | CreateSchedulerAndTargets,
        target: CreateSchedulerTarget | undefined,
        targetUuid: string | undefined,
        page: NotificationPayloadBase['page'] | undefined,
        traceProperties: TraceTaskBase,
    ) {
        if (!target) {
            throw new Error('Missing target for slack or email notification');
        }
        if (!page) {
            throw new Error(
                'Missing page data for slack or email notification',
            );
        }
        if (scheduler.format === SchedulerFormat.GSHEETS) {
            throw new Error("Can't add Google sheets notification");
        }

        const graphileClient = await this.graphileUtils;

        const schedulerUuid = getSchedulerUuid(scheduler);

        const getIdentifierAndPayload = (): {
            identifier: SchedulerTaskName;
            type: 'slack' | 'email' | 'msteams';
            payload:
                | SlackNotificationPayload
                | EmailNotificationPayload
                | MsTeamsNotificationPayload;
        } => {
            if (isCreateSchedulerSlackTarget(target)) {
                return {
                    identifier: 'sendSlackNotification',
                    type: 'slack',
                    payload: {
                        schedulerUuid,
                        jobGroup,
                        scheduledTime: date,
                        page,
                        schedulerSlackTargetUuid: targetUuid,
                        scheduler,
                        channel: target.channel,
                        ...traceProperties,
                    },
                };
            }
            if (isCreateSchedulerMsTeamsTarget(target)) {
                return {
                    identifier: SCHEDULER_TASKS.SEND_MSTEAMS_NOTIFICATION,
                    type: 'msteams',
                    payload: {
                        schedulerUuid,
                        jobGroup,
                        scheduledTime: date,
                        page,
                        schedulerMsTeamsTargetUuid: targetUuid,
                        scheduler,
                        webhook: target.webhook,
                        ...traceProperties,
                    },
                };
            }

            return {
                identifier: 'sendEmailNotification',
                type: 'email',
                payload: {
                    schedulerUuid,
                    scheduledTime: date,
                    jobGroup,
                    page,
                    schedulerEmailTargetUuid: targetUuid,
                    scheduler,
                    recipient: target.recipient,
                    ...traceProperties,
                },
            };
        };

        const { identifier, payload, type } = getIdentifierAndPayload();
        const id = await SchedulerClient.addJob(
            graphileClient,
            identifier,
            payload,
            date,
            JobPriority.LOW,
        );

        this.analytics.track({
            event: 'scheduler_notification_job.created',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId: id,
                schedulerId: schedulerUuid,
                schedulerTargetId: targetUuid,
                type,
                format: scheduler.format,
                sendNow: schedulerUuid === undefined,
            },
        });
        return { target, jobId: id };
    }

    async generateDailyJobsForScheduler(
        scheduler: SchedulerAndTargets,
        traceProperties: TraceTaskBase,
        defaultTimezone: string,
        // startingDateTime specifies that time after which to generate jobs.
        // If not provided, it will generate job after now, which is the desired
        // behavior for new schedulers and updates.
        startingDateTime?: Date,
    ): Promise<void> {
        if (scheduler.enabled === false) return; // Do not add jobs for disabled schedulers

        const dates = getDailyDatesFromCron(
            {
                cron: scheduler.cron,
                timezone: scheduler.timezone || defaultTimezone,
            },
            startingDateTime,
        );

        try {
            const promises = dates.map((date: Date) =>
                this.addScheduledDeliveryJob(
                    date,
                    {
                        ...scheduler,
                        ...traceProperties,
                    },
                    scheduler.schedulerUuid,
                ),
            );

            Logger.info(
                `Creating ${
                    promises.length
                } scheduled delivery jobs for scheduler ${
                    scheduler.schedulerUuid
                }. Cron: ${scheduler.cron} Timezone: ${
                    scheduler.timezone || defaultTimezone
                } Since: ${startingDateTime || '(now)'}`,
            );
            const jobs = await Promise.all(promises);
            Logger.info(
                `Created ${
                    promises.length
                } scheduled delivery jobs for scheduler ${
                    scheduler.schedulerUuid
                }. Job IDs: ${jobs.map((j) => j.jobId)}`,
            );
            jobs.map(async ({ jobId, date }) => {
                await this.schedulerModel.logSchedulerJob({
                    task: SCHEDULER_TASKS.HANDLE_SCHEDULED_DELIVERY,
                    schedulerUuid: scheduler.schedulerUuid,
                    jobGroup: jobId,
                    jobId,
                    scheduledTime: date,
                    status: SchedulerJobStatus.SCHEDULED,
                    details: {
                        projectUuid: traceProperties.projectUuid,
                        organizationUuid: traceProperties.organizationUuid,
                        createdByUserUuid: scheduler.createdBy,
                    },
                });
            });
        } catch (err: AnyType) {
            Logger.error(
                `Unable to schedule job for scheduler ${scheduler.schedulerUuid}`,
                err,
            );
            throw err;
        }
    }

    async generateJobsForSchedulerTargets(
        scheduledTime: Date,
        scheduler: SchedulerAndTargets | CreateSchedulerAndTargets,
        page: NotificationPayloadBase['page'] | undefined,
        parentJobId: string,
        traceProperties: TraceTaskBase,
    ) {
        const schedulerUuid = getSchedulerUuid(scheduler);

        try {
            if (scheduler.format === SchedulerFormat.GSHEETS) {
                if (!hasSchedulerUuid(scheduler)) {
                    throw Error(
                        'Unable to run Google sheet delivery on unsaved scheduled delivery',
                    );
                }
                Logger.info(
                    `Creating gsheet notification jobs for scheduler ${schedulerUuid}`,
                );
                const job = await this.addGsheetsUploadJob(
                    scheduledTime,
                    parentJobId,
                    scheduler,
                    traceProperties,
                );
                return [{ ...job, target: undefined }];
            }
            const promises = scheduler.targets.map((target) =>
                this.addNotificationJob(
                    scheduledTime,
                    parentJobId,
                    scheduler,
                    target,
                    getSchedulerTargetUuid(target),
                    page,
                    traceProperties,
                ),
            );
            Logger.info(
                `Creating ${promises.length} notification jobs for scheduler ${schedulerUuid}`,
            );
            return await Promise.all(promises);
        } catch (err: AnyType) {
            Logger.error(
                `Unable to schedule notification job for scheduler ${schedulerUuid}`,
                err,
            );
            throw err;
        }
    }

    async downloadCsvJob(payload: DownloadCsvPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            SCHEDULER_TASKS.DOWNLOAD_CSV,
            payload,
            now,
            JobPriority.HIGH,
        );

        await this.schedulerModel.logSchedulerJob({
            task: SCHEDULER_TASKS.DOWNLOAD_CSV,
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                createdByUserUuid: payload.userUuid,
                projectUuid: payload.projectUuid,
                exploreId: payload.exploreId,
                metricQuery: payload.metricQuery,
                organizationUuid: payload.organizationUuid,
            },
        });

        return { jobId };
    }

    async uploadGsheetFromQueryJob(payload: UploadMetricGsheetPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            SCHEDULER_TASKS.UPLOAD_GSHEET_FROM_QUERY,
            payload,
            now,
            JobPriority.LOW,
        );

        await this.schedulerModel.logSchedulerJob({
            task: SCHEDULER_TASKS.UPLOAD_GSHEET_FROM_QUERY,
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                createdByUserUuid: payload.userUuid,
                projectUuid: payload.projectUuid,
                exploreId: payload.exploreId,
                metricQuery: payload.metricQuery,
                organizationUuid: payload.organizationUuid,
            },
        });

        return { jobId };
    }

    async generateValidation(payload: ValidateProjectPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            SCHEDULER_TASKS.VALIDATE_PROJECT,
            payload,
            now,
            JobPriority.MEDIUM,
        );

        await this.schedulerModel.logSchedulerJob({
            task: SCHEDULER_TASKS.VALIDATE_PROJECT,
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                createdByUserUuid: payload.userUuid,
                projectUuid: payload.projectUuid,
                organizationUuid: payload.organizationUuid,
                context: payload.context,
            },
        });

        return jobId;
    }

    async runSql(payload: SqlRunnerPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            SCHEDULER_TASKS.SQL_RUNNER,
            payload,
            now,
            JobPriority.HIGH,
        );
        await this.schedulerModel.logSchedulerJob({
            task: SCHEDULER_TASKS.SQL_RUNNER,
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                createdByUserUuid: payload.userUuid,
                projectUuid: payload.projectUuid,
                organizationUuid: payload.organizationUuid,
            },
        });

        return jobId;
    }

    async runSqlPivotQuery(payload: SqlRunnerPivotQueryPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            SCHEDULER_TASKS.SQL_RUNNER_PIVOT_QUERY,
            payload,
            now,
            JobPriority.HIGH,
        );

        await this.schedulerModel.logSchedulerJob({
            task: SCHEDULER_TASKS.SQL_RUNNER_PIVOT_QUERY,
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                createdByUserUuid: payload.userUuid,
                projectUuid: payload.projectUuid,
                organizationUuid: payload.organizationUuid,
            },
        });

        return jobId;
    }

    async compileProject(payload: CompileProjectPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            SCHEDULER_TASKS.COMPILE_PROJECT,
            payload,
            now,
            JobPriority.HIGH,
            1,
        );

        await this.schedulerModel.logSchedulerJob({
            task: SCHEDULER_TASKS.COMPILE_PROJECT,
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                createdByUserUuid: payload.createdByUserUuid,
                organizationUuid: payload.organizationUuid,
                projectUuid: payload.projectUuid,
                requestMethod: payload.requestMethod,
                isPreview: payload.isPreview,
                jobUuid: payload.jobUuid,
            },
        });

        return { jobId };
    }

    async createProjectWithCompile(
        payload: SchedulerCreateProjectWithCompilePayload,
    ) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();

        const jobId = await SchedulerClient.addJob(
            graphileClient,
            SCHEDULER_TASKS.CREATE_PROJECT_WITH_COMPILE,
            payload,
            now,
            1,
        );

        await this.schedulerModel.logSchedulerJob({
            task: SCHEDULER_TASKS.CREATE_PROJECT_WITH_COMPILE,
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                createdByUserUuid: payload.createdByUserUuid,
                organizationUuid: payload.organizationUuid,
                requestMethod: payload.requestMethod,
                isPreview: payload.isPreview,
                projectUuid: payload.projectUuid,
            },
        });

        return { jobId };
    }

    async testAndCompileProject(payload: CompileProjectPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            SCHEDULER_TASKS.TEST_AND_COMPILE_PROJECT,
            payload,
            now,
            JobPriority.HIGH,
            1,
        );

        await this.schedulerModel.logSchedulerJob({
            task: SCHEDULER_TASKS.TEST_AND_COMPILE_PROJECT,
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                createdByUserUuid: payload.createdByUserUuid,
                organizationUuid: payload.organizationUuid,
                projectUuid: payload.projectUuid,
                requestMethod: payload.requestMethod,
                isPreview: payload.isPreview,
                jobUuid: payload.jobUuid,
            },
        });

        return { jobId };
    }

    async scheduleTask<T extends SchedulerTaskName>(
        task: SchedulerTaskName,
        payload: TaskPayloadMap[T],
        priority?: JobPriority,
        retries?: number,
    ) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            task,
            payload,
            now,
            priority || JobPriority.LOW,
            retries || 1,
        );

        await this.schedulerModel.logSchedulerJob({
            task,
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                userUuid: payload.userUuid,
                organizationUuid: payload.organizationUuid,
                projectUuid: payload.projectUuid,
                createdByUserUuid: payload.userUuid,
            },
        });

        return { jobId };
    }

    async replaceCustomFields(payload: ReplaceCustomFieldsPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            SCHEDULER_TASKS.REPLACE_CUSTOM_FIELDS,
            payload,
            now,
            JobPriority.LOW,
            1,
        );

        await this.schedulerModel.logSchedulerJob({
            task: SCHEDULER_TASKS.REPLACE_CUSTOM_FIELDS,
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                userUuid: payload.userUuid,
                organizationUuid: payload.organizationUuid,
                projectUuid: payload.projectUuid,
                createdByUserUuid: payload.userUuid,
            },
        });

        return { jobId };
    }

    // Indexes catalog and calculates chart usages - for example, metric_1 is used by 2 charts, so its chart_usage will be 2
    async indexCatalog(payload: SchedulerIndexCatalogJobPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            SCHEDULER_TASKS.INDEX_CATALOG,
            payload,
            now,
            JobPriority.MEDIUM,
        );
        await this.schedulerModel.logSchedulerJob({
            task: SCHEDULER_TASKS.INDEX_CATALOG,
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                createdByUserUuid: payload.userUuid,
                projectUuid: payload.projectUuid,
                organizationUuid: payload.organizationUuid,
            },
        });

        return jobId;
    }

    async getJobStatistics(): Promise<
        { error: boolean; locked: boolean; count: number }[]
    > {
        const graphileClient = await this.graphileUtils;
        const query = `
            select 
              last_error is not null as error, 
              locked_by is not null as locked, 
              count(*) as count
            from graphile_worker.jobs
            group by 1, 2
        `;
        const stats = await graphileClient.withPgClient(async (pgClient) => {
            const { rows } = await pgClient.query(query);
            return rows;
        });
        return stats;
    }
}
