import {
    DownloadCsvPayload,
    EmailNotificationPayload,
    isSlackTarget,
    NotificationPayloadBase,
    ScheduledDeliveryPayload,
    ScheduledJobs,
    Scheduler,
    SchedulerAndTargets,
    SchedulerEmailTarget,
    SchedulerJobStatus,
    SchedulerSlackTarget,
    SlackNotificationPayload,
} from '@lightdash/common';
import { getSchedule, stringToArray } from 'cron-converter';
import { makeWorkerUtils, WorkerUtils } from 'graphile-worker';
import moment from 'moment';
import { nanoid } from 'nanoid';
import { analytics } from '../analytics/client';
import {
    DownloadCsv,
    LightdashAnalytics,
} from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logger';
import { SchedulerModel } from '../models/SchedulerModel';

type SchedulerClientDependencies = {
    lightdashConfig: LightdashConfig;
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

    graphileUtils: Promise<WorkerUtils>;

    schedulerModel: SchedulerModel;

    constructor({
        lightdashConfig,
        schedulerModel,
    }: SchedulerClientDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.schedulerModel = schedulerModel;
        this.graphileUtils = makeWorkerUtils({
            connectionString: lightdashConfig.database.connectionUri,
        }).then((utils) =>
            utils
                .migrate()
                .then(() => utils)
                .catch((e: any) => {
                    Logger.warn('Error migrating graphile worker', e);
                    return utils;
                }),
        );
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
            analytics.track({
                event: 'scheduler_job.deleted',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId: id,
                    schedulerId: schedulerUuid,
                },
            });
        });
    }

    private async addScheduledDeliveryJob(date: Date, scheduler: Scheduler) {
        const graphileClient = await this.graphileUtils;

        const payload: ScheduledDeliveryPayload = {
            schedulerUuid: scheduler.schedulerUuid,
        };
        const { id } = await graphileClient.addJob(
            'handleScheduledDelivery',
            payload,
            {
                runAt: date,
                maxAttempts: 1,
            },
        );
        analytics.track({
            event: 'scheduler_job.created',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId: id,
                schedulerId: scheduler.schedulerUuid,
            },
        });

        return { jobId: id, date };
    }

    private async addNotificationJob(
        date: Date,
        jobGroup: string,
        scheduler: Scheduler,
        target: SchedulerSlackTarget | SchedulerEmailTarget,
        page: NotificationPayloadBase['page'],
    ) {
        const graphileClient = await this.graphileUtils;

        const payload: SlackNotificationPayload | EmailNotificationPayload =
            isSlackTarget(target)
                ? {
                      schedulerUuid: scheduler.schedulerUuid,
                      jobGroup,
                      scheduledTime: date,
                      page,
                      schedulerSlackTargetUuid: target.schedulerSlackTargetUuid,
                  }
                : {
                      schedulerUuid: scheduler.schedulerUuid,
                      scheduledTime: date,
                      jobGroup,
                      page,
                      schedulerEmailTargetUuid: target.schedulerEmailTargetUuid,
                  };
        const { id } = await graphileClient.addJob(
            isSlackTarget(target)
                ? 'sendSlackNotification'
                : 'sendEmailNotification',
            payload,
            {
                runAt: date,
                maxAttempts: 1,
            },
        );
        analytics.track({
            event: 'scheduler_notification_job.created',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                jobId: id,
                schedulerId: scheduler.schedulerUuid,
                schedulerTargetId: isSlackTarget(target)
                    ? target.schedulerSlackTargetUuid
                    : target.schedulerEmailTargetUuid,
                type: isSlackTarget(target) ? 'slack' : 'email',
                format: scheduler.format,
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
                this.addScheduledDeliveryJob(date, scheduler),
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
        scheduler: SchedulerAndTargets,
        page: NotificationPayloadBase['page'],
        parentJobId: string,
    ) {
        try {
            const promises = scheduler.targets.map((target) =>
                this.addNotificationJob(
                    scheduledTime,
                    parentJobId,
                    scheduler,
                    target,
                    page,
                ),
            );

            Logger.info(
                `Creating ${promises.length} notification jobs for scheduler ${scheduler.schedulerUuid}`,
            );
            return await Promise.all(promises);
        } catch (err: any) {
            Logger.error(
                `Unable to schedule notification job for scheduler ${scheduler.schedulerUuid}`,
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
}
