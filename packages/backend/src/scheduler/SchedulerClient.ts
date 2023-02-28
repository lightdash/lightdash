import {
    EmailNotificationPayload,
    isSlackTarget,
    NotificationPayloadBase,
    ScheduledDeliveryPayload,
    ScheduledJobs,
    Scheduler,
    SchedulerAndTargets,
    SchedulerEmailTarget,
    SchedulerSlackTarget,
    SlackNotificationPayload,
} from '@lightdash/common';
import { getSchedule, stringToArray } from 'cron-converter';
import { makeWorkerUtils, WorkerUtils } from 'graphile-worker';
import moment from 'moment';
import { analytics } from '../analytics/client';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logger';

type SchedulerClientDependencies = {
    lightdashConfig: LightdashConfig;
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

    constructor({ lightdashConfig }: SchedulerClientDependencies) {
        this.lightdashConfig = lightdashConfig;
        this.graphileUtils = makeWorkerUtils({});

        this.graphileUtils.then((utils) => {
            utils.migrate().catch((e: any) => {
                Logger.warn('Error migrating graphile worker', e);
            });
        });
    }

    async getScheduledJobs(schedulerUuid: string): Promise<ScheduledJobs[]> {
        const graphileClient = await this.graphileUtils;

        const scheduledJobs = await graphileClient.withPgClient((pgClient) =>
            pgClient.query(
                "select id, run_at from graphile_worker.jobs where payload->>'schedulerUuid' = $1",
                [`${schedulerUuid}%`],
            ),
        );
        return scheduledJobs.rows.map((r) => ({
            id: r.id,
            date: r.run_at,
        }));
    }

    async deleteScheduledJobs(schedulerUuid: string): Promise<void> {
        const graphileClient = await this.graphileUtils;
        console.log('here');
        const deletedJobs = await graphileClient.withPgClient((pgClient) =>
            pgClient.query<{
                id: string;
            }>(
                `select id from graphile_worker.jobs where payload->>'schedulerUuid' = $1`,
                [`${schedulerUuid}%`],
            ),
        );
        Logger.info(
            `Deleting ${deletedJobs.rows.length} notification scheduled jobs: ${schedulerUuid}`,
        );
        const deletedJobIds = deletedJobs.rows.map((r) => r.id);

        await graphileClient.completeJobs(deletedJobIds);

        deletedJobs.rows.forEach(({ id }) => {
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

    private async addScheduledDeliveryJob(
        date: Date,
        scheduler: Scheduler,
    ): Promise<void> {
        const graphileClient = await this.graphileUtils;

        const payload: ScheduledDeliveryPayload = {
            schedulerUuid: scheduler.schedulerUuid,
        };
        const { id } = await graphileClient.addJob(
            'handleScheduledDelivery',
            payload,
            {
                runAt: date,
                maxAttempts: 3,
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
    }

    private async addNotificationJob(
        date: Date,
        scheduler: Scheduler,
        target: SchedulerSlackTarget | SchedulerEmailTarget,
        page: NotificationPayloadBase['page'],
    ): Promise<void> {
        const graphileClient = await this.graphileUtils;

        const payload: SlackNotificationPayload | EmailNotificationPayload =
            isSlackTarget(target)
                ? {
                      schedulerUuid: scheduler.schedulerUuid,
                      page,
                      schedulerSlackTargetUuid: target.schedulerSlackTargetUuid,
                  }
                : {
                      schedulerUuid: scheduler.schedulerUuid,
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
                maxAttempts: 3,
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
            await Promise.all(promises);
        } catch (err: any) {
            Logger.error(
                `Unable to schedule job for scheduler ${scheduler.schedulerUuid}`,
                err,
            );
            throw err;
        }
    }

    async generateJobsForSchedulerTargets(
        scheduler: SchedulerAndTargets,
        page: NotificationPayloadBase['page'],
    ): Promise<void> {
        try {
            const promises = scheduler.targets.map((target) =>
                this.addNotificationJob(new Date(), scheduler, target, page),
            );

            Logger.info(
                `Creating ${promises.length} notification jobs for scheduler ${scheduler.schedulerUuid}`,
            );
            await Promise.all(promises);
        } catch (err: any) {
            Logger.error(
                `Unable to schedule notification job for scheduler ${scheduler.schedulerUuid}`,
                err,
            );
            throw err;
        }
    }
}
