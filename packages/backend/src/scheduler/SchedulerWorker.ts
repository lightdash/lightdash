import { getSchedule, stringToArray } from 'cron-converter';
import {
    JobHelpers,
    parseCronItems,
    run as runGraphileWorker,
} from 'graphile-worker';
import moment from 'moment';
import { schedulerClient } from '../clients/clients';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logger';
import { schedulerService } from '../services/services';
import { sendSlackNotification } from './SchedulerTask';

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

    async run() {
        // Run a worker to execute jobs:
        Logger.info('Running scheduler');
        const runner = await runGraphileWorker({
            concurrency: this.lightdashConfig.scheduler?.concurrency,
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
            ]),
            taskList: {
                generateDailyJobs: async (
                    payload: unknown,
                    helpers: JobHelpers,
                ) => {
                    Logger.info(
                        `Processing new job generateDailyJobs`,
                        payload,
                    );
                    const schedulers =
                        await schedulerService.getAllSchedulers();
                    const promises = schedulers.map(
                        schedulerClient.generateDailyJobsForScheduler,
                    );
                    await Promise.all(promises);
                },
                sendSlackNotification: async (
                    payload: any,
                    helpers: JobHelpers,
                ) => {
                    Logger.info(
                        `Processing new job sendSlackNotification`,
                        payload,
                    );
                    await sendSlackNotification(payload);
                },
            },
        });
        await runner.promise;
    }
}
