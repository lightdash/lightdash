import { Scheduler } from '@lightdash/common';
import { getSchedule, stringToArray } from 'cron-converter';
import { makeWorkerUtils } from 'graphile-worker';
import moment from 'moment';
import Logger from '../logger';

export const graphileUtils = makeWorkerUtils({});

const getDailyDatesFromCron = (cron: string, when = new Date()): Date[] => {
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

export const deleteScheduledJobs = async (
    schedulerUuid: string,
): Promise<void> => {
    const graphileClient = await graphileUtils;

    const deletedJobs = await graphileClient.withPgClient((pgClient) =>
        pgClient.query(
            "select id from graphile_worker.jobs where payload->>'schedulerUuid' like $1",
            [`${schedulerUuid}%`],
        ),
    );
    Logger.info(
        `Deleting ${deletedJobs.rows.length} Slack notification scheduled jobs: ${schedulerUuid}`,
    );
    const deletedJobIds = deletedJobs.rows.map((r) => r.id);

    graphileClient.completeJobs(deletedJobIds);
};

export const generateDailyJobsForScheduler = async (
    scheduler: Scheduler,
): Promise<void> => {
    const dates = getDailyDatesFromCron(scheduler.cron);

    const graphileClient = await graphileUtils;

    try {
        const promises = dates.map(async (date: Date, i: number) =>
            // TODO add 1 job per target
            graphileClient.addJob('sendSlackNotification', scheduler, {
                runAt: date,
                maxAttempts: 2,
            }),
        );

        Logger.info(
            `Creating new ${promises.length} Slack notification jobs: ${scheduler.name}`,
        );
        await Promise.all(promises);
    } catch (err: any) {
        Logger.error(`Unable to schedule job ${scheduler.name}`, err);
    }
};
