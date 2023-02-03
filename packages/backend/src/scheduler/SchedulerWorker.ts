import {
    arrayToString,
    getSchedule,
    getUnits,
    stringToArray,
} from 'cron-converter';
import {
    CronItem,
    JobHelpers,
    parseCronItems,
    parseCrontab,
    run as runGraphileWorker,
} from 'graphile-worker';
import moment from 'moment';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logger';
import { schedulerService, slackClient } from '../services/services';

type SchedulerWorkerDependencies = {
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
        .add(1, 'day')
        .startOf('day')
        .toDate();
    const dailyDates: Date[] = [];
    while (schedule.next() < tomorrow) {
        dailyDates.push(schedule.date.toJSDate());
    }
    return dailyDates;
};

export class SchedulerWorker {
    lightdashConfig: LightdashConfig;

    constructor({ lightdashConfig }: SchedulerWorkerDependencies) {
        this.lightdashConfig = lightdashConfig;
    }

    static async run() {
        // Run a worker to execute jobs:
        Logger.info('Running scheduler');
        const runner = await runGraphileWorker({
            concurrency: 2,
            // Install signal handlers for graceful shutdown on SIGINT, SIGTERM, etc
            noHandleSignals: false,
            pollInterval: 1000,
            parsedCronItems: parseCronItems([
                {
                    task: 'generateDailyJobs',
                    pattern: '0 0 * * *',
                    options: {
                        backfillPeriod: 12 * 3600 * 1000 /* 12 hours in ms */,
                        maxAttempts: 1,
                    },
                },
                // { task: 'periodicSlackMessage', pattern: '* * * * *' }, // TODO remove after testing
            ]), // Generate daily jobs every day at 00:00
            // new CronItem(), ['0 0 * * * generateDailyJobs ?fill=12h&max=1', '* * * * * periodicSlackMessage '])
            // you can set the taskList or taskDirectory but not both
            taskList: {
                generateDailyJobs: async (
                    payload: unknown,
                    helpers: JobHelpers,
                ) => {
                    Logger.info(`generateDailyJobs`, payload);

                    const schedulers =
                        await schedulerService.getAllSchedulers();
                    schedulers.map(async (scheduler) => {
                        const dates = getDailyDatesFromCron(scheduler.cron);
                        dates.map(async (date) => {
                            await runner.addJob(scheduler.name, scheduler, {
                                runAt: date,
                            });
                        });
                    });
                },
                periodicSlackMessage: async (
                    // TODO remove after testing
                    payload: unknown,
                    helpers: JobHelpers,
                ) => {
                    Logger.info(`periodicSlackMessage`, payload);

                    await runner.addJob('sendSlackMessage', {
                        organizationUuid:
                            '172a2270-000f-42be-9c68-c4752c23ae51',
                        text: 'slack periodic test message',
                        channel: 'test-slackbot-2',
                    });
                },
                sendSlackMessage: async (payload: any, helpers: JobHelpers) => {
                    Logger.info(`sendSlackMessage`, payload);
                    slackClient.sendText(payload);
                },

                sendSlackNotification: async (payload: any) => {
                    slackClient.sendNotification(payload);
                },
            },
        });
        await runner.promise;
    }
}
