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
    UploadMetricGsheetPayload,
    ValidateProjectPayload,
} from '@lightdash/common';
import { getSchedule, stringToArray } from 'cron-converter';
import { makeWorkerUtils, WorkerUtils } from 'graphile-worker';
import moment from 'moment';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import { SchedulerModel } from '../models/SchedulerModel';

type SchedulerClientArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    schedulerModel: SchedulerModel;
};

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
        const { id } = await graphileClient.addJob(
            'handleScheduledDelivery',
            payload,
            {
                runAt: date,
                maxAttempts: 1,
            },
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

        const { id } = await graphileClient.addJob('uploadGsheets', payload, {
            runAt: date,
            maxAttempts: 1,
        });
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
        const { id } = await graphileClient.addJob(identifier, payload, {
            runAt: date,
            maxAttempts: 1,
        });
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
        const { id: jobId } = await graphileClient.addJob(
            'downloadCsv',
            payload,
            {
                runAt: now, // now
                maxAttempts: 1,
            },
        );
        await this.schedulerModel.logSchedulerJob({
            task: 'downloadCsv',
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: { createdByUserUuid: payload.userUuid },
        });

        return { jobId };
    }

    async uploadGsheetFromQueryJob(payload: UploadMetricGsheetPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            'uploadGsheetFromQuery',
            payload,
            {
                runAt: now,
                maxAttempts: 1,
            },
        );
        await this.schedulerModel.logSchedulerJob({
            task: 'uploadGsheetFromQuery',
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: { createdByUserUuid: payload.userUuid },
        });

        return { jobId };
    }

    async generateValidation(payload: ValidateProjectPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            'validateProject',
            payload,
            {
                runAt: now,
                maxAttempts: 1,
            },
        );
        await this.schedulerModel.logSchedulerJob({
            task: 'validateProject',
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: {},
        });

        return jobId;
    }

    async compileProject(payload: CompileProjectPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            'compileProject',
            payload,
            {
                runAt: now, // now
                maxAttempts: 1,
            },
        );
        await this.schedulerModel.logSchedulerJob({
            task: 'compileProject',
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: { createdByUserUuid: payload.createdByUserUuid },
        });

        return { jobId };
    }

    async testAndCompileProject(payload: CompileProjectPayload) {
        const graphileClient = await this.graphileUtils;
        const now = new Date();
        const { id: jobId } = await graphileClient.addJob(
            'testAndCompileProject',
            payload,
            {
                runAt: now, // now
                maxAttempts: 1,
            },
        );
        await this.schedulerModel.logSchedulerJob({
            task: 'testAndCompileProject',
            jobId,
            scheduledTime: now,
            status: SchedulerJobStatus.SCHEDULED,
            details: { createdByUserUuid: payload.createdByUserUuid },
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
