import {
    isSlackTarget,
    ScheduledEmailNotification,
    ScheduledJobs,
    ScheduledSlackNotification,
    Scheduler,
    SchedulerAndTargets,
    SchedulerEmailTarget,
    SchedulerSlackTarget,
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
                "select id, run_at , payload->>'channel' as channel from graphile_worker.jobs where payload->>'schedulerUuid' like $1",
                [`${schedulerUuid}%`],
            ),
        );
        return scheduledJobs.rows.map((r) => ({
            id: r.id,
            channel: r.channel,
            date: r.run_at,
        }));
    }

    async deleteScheduledJobs(schedulerUuid: string): Promise<void> {
        const graphileClient = await this.graphileUtils;

        const deletedJobs = await graphileClient.withPgClient((pgClient) =>
            pgClient.query<{ id: string; scheduler_slack_target_uuid: string }>(
                "select id, payload->>'schedulerSlackTargetUuid' as scheduler_slack_target_uuid from graphile_worker.jobs where payload->>'schedulerUuid' like $1",
                [`${schedulerUuid}%`],
            ),
        );
        Logger.info(
            `Deleting ${deletedJobs.rows.length} notification scheduled jobs: ${schedulerUuid}`,
        );
        const deletedJobIds = deletedJobs.rows.map((r) => r.id);

        await graphileClient.completeJobs(deletedJobIds);

        deletedJobs.rows.forEach(({ id, scheduler_slack_target_uuid }) => {
            analytics.track({
                event: 'scheduler_job.deleted',
                anonymousId: LightdashAnalytics.anonymousId,
                properties: {
                    jobId: id,
                    schedulerId: schedulerUuid,
                    schedulerTargetId: scheduler_slack_target_uuid,
                },
            });
        });
    }

    async addJob(
        date: Date,
        scheduler: Scheduler,
        target: SchedulerSlackTarget | SchedulerEmailTarget,
    ): Promise<void> {
        const graphileClient = await this.graphileUtils;

        const notification:
            | ScheduledSlackNotification
            | ScheduledEmailNotification = isSlackTarget(target)
            ? {
                  schedulerUuid: scheduler.schedulerUuid,
                  channel: target.channel,
                  createdBy: scheduler.createdBy,
                  dashboardUuid: scheduler.dashboardUuid,
                  savedChartUuid: scheduler.savedChartUuid,
                  schedulerSlackTargetUuid: target.schedulerSlackTargetUuid,
                  name: scheduler.name,
              }
            : {
                  schedulerUuid: scheduler.schedulerUuid,
                  recipient: target.recipient,
                  createdBy: scheduler.createdBy,
                  dashboardUuid: scheduler.dashboardUuid,
                  savedChartUuid: scheduler.savedChartUuid,
                  schedulerEmailTargetUuid: target.schedulerEmailTargetUuid,
                  name: scheduler.name,
              };
        const { id } = await graphileClient.addJob(
            isSlackTarget(target)
                ? 'sendSlackNotification'
                : 'sendEmailNotification',
            notification,
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
                schedulerTargetId: isSlackTarget(target)
                    ? target.schedulerSlackTargetUuid
                    : target.schedulerEmailTargetUuid,
            },
        });
    }

    async generateDailyJobsForScheduler(
        scheduler: SchedulerAndTargets,
    ): Promise<void> {
        const dates = getDailyDatesFromCron(scheduler.cron);
        try {
            const promises = dates.flatMap((date: Date) =>
                scheduler.targets.map((target) =>
                    this.addJob(date, scheduler, target),
                ),
            );

            Logger.info(
                `Creating new ${promises.length} notification jobs: ${scheduler.name}`,
            );
            await Promise.all(promises);
        } catch (err: any) {
            Logger.error(`Unable to schedule job ${scheduler.name}`, err);
        }
    }
}
