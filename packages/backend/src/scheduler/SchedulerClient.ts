import {
    CompileProjectPayload,
    CreateSchedulerAndTargets,
    CreateSchedulerTarget,
    DownloadCsvPayload,
    EmailNotificationPayload,
    getSchedulerTargetUuid,
    getSchedulerUuid,
    GsheetsNotificationPayload,
    hasSchedulerUuid,
    isCreateSchedulerSlackTarget,
    NotificationPayloadBase,
    ScheduledDeliveryPayload,
    ScheduledJobs,
    Scheduler,
    SchedulerAndTargets,
    SchedulerFormat,
    SchedulerJobStatus,
    SlackNotificationPayload,
    UnexpectedServerError,
    UploadMetricGsheetPayload,
    ValidateProjectPayload,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { getSchedule, stringToArray } from 'cron-converter';
import { makeWorkerUtils, WorkerUtils } from 'graphile-worker';
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
    cron: string,
    when = new Date(),
): Date[] => {
    const arr = stringToArray(cron);
    const startOfMinute = moment(when).startOf('minute').toDate(); // round down to the nearest minute so we can even process 00:00 on daily jobs
    const schedule = getSchedule(arr, startOfMinute, 'UTC');

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
            .catch((e: any) => {
                Logger.error('Error migrating graphile worker', e);
                process.exit(1);
            });
    }

    static async processJob(
        task: string,
        jobId: string,
        runAt: Date,
        payload: any,
        funct: () => Promise<void>,
    ) {
        const { traceHeader, baggageHeader, sentryMessageId } = payload;
        const latency = Date.now() - runAt.getTime();
        return new Promise<void>((resolve, reject) => {
            Sentry.continueTrace(
                { sentryTrace: traceHeader, baggage: baggageHeader },
                async () => {
                    await Sentry.startSpan(
                        {
                            name: 'queue_consumer_transaction',
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
                                        'messaging.message.job.id': jobId,
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

    private static async addJob(
        graphileClient: WorkerUtils,
        identifier: string,
        payload: any,
        scheduledAt: Date,
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
                const payloadWithSentryHeaders = {
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
                    },
                );

                // span.setAttribute('messaging.message.job.id', id);
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
                'select count(id) as count from graphile_worker.jobs where attempts <> max_attempts',
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
        scheduler: Scheduler | CreateSchedulerAndTargets,
        schedulerUuid: string | undefined,
    ) {
        const graphileClient = await this.graphileUtils;

        const payload: ScheduledDeliveryPayload = schedulerUuid
            ? {
                  schedulerUuid,
              }
            : scheduler;

        let maxAttempts = SCHEDULED_JOB_MAX_ATTEMPTS;
        if (
            scheduler.format === SchedulerFormat.IMAGE &&
            !!scheduler.dashboardUuid
        ) {
            maxAttempts = SCHEDULED_JOB_MAX_ATTEMPTS + 1;
        }

        const id = await SchedulerClient.addJob(
            graphileClient,
            'handleScheduledDelivery',
            payload,
            date,
            maxAttempts,
        );
        await this.schedulerModel.logSchedulerJob({
            task: 'handleScheduledDelivery',
            schedulerUuid,
            jobGroup: id,
            jobId: id,
            scheduledTime: date,
            status: SchedulerJobStatus.SCHEDULED,
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
    ) {
        const graphileClient = await this.graphileUtils;

        const payload: GsheetsNotificationPayload = {
            schedulerUuid: scheduler.schedulerUuid,
            jobGroup,
            scheduledTime: date,
        };
        const id = await SchedulerClient.addJob(
            graphileClient,
            'uploadGsheets',
            payload,
            date,
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
            identifier: string;
            type: 'slack' | 'email';
            payload: SlackNotificationPayload | EmailNotificationPayload;
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
                },
            };
        };

        const { identifier, payload, type } = getIdentifierAndPayload();
        const id = await SchedulerClient.addJob(
            graphileClient,
            identifier,
            payload,
            date,
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
    ): Promise<void> {
        if (scheduler.enabled === false) return; // Do not add jobs for disabled schedulers
        const dates = getDailyDatesFromCron(scheduler.cron);
        try {
            const promises = dates.map((date: Date) =>
                this.addScheduledDeliveryJob(
                    date,
                    scheduler,
                    scheduler.schedulerUuid,
                ),
            );

            Logger.info(
                `Creating ${promises.length} scheduled delivery jobs for scheduler ${scheduler.schedulerUuid}`,
            );
            const jobs = await Promise.all(promises);
            jobs.map(async ({ jobId, date }) => {
                await this.schedulerModel.logSchedulerJob({
                    task: 'handleScheduledDelivery',
                    schedulerUuid: scheduler.schedulerUuid,
                    jobGroup: jobId,
                    jobId,
                    scheduledTime: date,
                    status: SchedulerJobStatus.SCHEDULED,
                });
            });
        } catch (err: any) {
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
                ),
            );
            Logger.info(
                `Creating ${promises.length} notification jobs for scheduler ${schedulerUuid}`,
            );
            return await Promise.all(promises);
        } catch (err: any) {
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
            'downloadCsv',
            payload,
            now,
        );

        await this.schedulerModel.logSchedulerJob({
            task: 'downloadCsv',
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                createdByUserUuid: payload.userUuid,
                projectUuid: payload.projectUuid,
                exploreId: payload.exploreId,
                metricQuery: payload.metricQuery,
            },
        });

        return { jobId };
    }

    async uploadGsheetFromQueryJob(payload: UploadMetricGsheetPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            'uploadGsheetFromQuery',
            payload,
            now,
        );

        await this.schedulerModel.logSchedulerJob({
            task: 'uploadGsheetFromQuery',
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {
                createdByUserUuid: payload.userUuid,
                projectUuid: payload.projectUuid,
                exploreId: payload.exploreId,
                metricQuery: payload.metricQuery,
            },
        });

        return { jobId };
    }

    async generateValidation(payload: ValidateProjectPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            'validateProject',
            payload,
            now,
        );

        await this.schedulerModel.logSchedulerJob({
            task: 'validateProject',
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

    async compileProject(payload: CompileProjectPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            'compileProject',
            payload,
            now,
        );

        await this.schedulerModel.logSchedulerJob({
            task: 'compileProject',
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

    async testAndCompileProject(payload: CompileProjectPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const jobId = await SchedulerClient.addJob(
            graphileClient,
            'testAndCompileProject',
            payload,
            now,
        );

        await this.schedulerModel.logSchedulerJob({
            task: 'testAndCompileProject',
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
