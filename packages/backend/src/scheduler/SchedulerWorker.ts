import { getSchedule, stringToArray } from 'cron-converter';
import {
    JobHelpers,
    Logger as GraphileLogger,
    parseCronItems,
    run as runGraphileWorker,
    Runner,
} from 'graphile-worker';
import moment from 'moment';
import { schedulerClient } from '../clients/clients';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logger';
import { schedulerService } from '../services/services';
import { tryJobOrTimeout } from './SchedulerJobTimeout';
import {
    downloadCsv,
    handleScheduledDelivery,
    sendEmailNotification,
    sendSlackNotification,
} from './SchedulerTask';
import schedulerWorkerEventEmitter from './SchedulerWorkerEventEmitter';

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

const workerLogger = new GraphileLogger((scope) => (_, message, meta) => {
    Logger.debug(message, { meta, scope });
});

export class SchedulerWorker {
    lightdashConfig: LightdashConfig;

    runner: Runner | undefined;

    isRunning: boolean = false;

    constructor({ lightdashConfig }: SchedulerWorkerDependencies) {
        this.lightdashConfig = lightdashConfig;
    }

    async run() {
        // Wait for graphile utils to finish migration and prevent race conditions
        await schedulerClient.graphileUtils;
        // Run a worker to execute jobs:
        Logger.info('Running scheduler');

        this.runner = await runGraphileWorker({
            connectionString: this.lightdashConfig.database.connectionUri,
            logger: workerLogger,
            concurrency: this.lightdashConfig.scheduler?.concurrency,
            noHandleSignals: false,
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
            taskList: {
                generateDailyJobs: async () => {
                    const schedulers =
                        await schedulerService.getAllSchedulers();
                    const promises = schedulers.map(async (scheduler) => {
                        await schedulerClient.generateDailyJobsForScheduler(
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
                        handleScheduledDelivery(
                            helpers.job.id,
                            helpers.job.run_at,
                            payload,
                        ),
                        helpers.job,
                    );
                },
                sendSlackNotification: async (
                    payload: any,
                    helpers: JobHelpers,
                ) => {
                    await tryJobOrTimeout(
                        sendSlackNotification(helpers.job.id, payload),
                        helpers.job,
                    );
                },
                sendEmailNotification: async (
                    payload: any,
                    helpers: JobHelpers,
                ) => {
                    await tryJobOrTimeout(
                        sendEmailNotification(helpers.job.id, payload),
                        helpers.job,
                    );
                },
                downloadCsv: async (payload: any, helpers: JobHelpers) => {
                    await tryJobOrTimeout(
                        downloadCsv(
                            helpers.job.id,
                            helpers.job.run_at,
                            payload,
                        ),
                        helpers.job,
                    );
                },
            },
            events: schedulerWorkerEventEmitter,
        });

        this.isRunning = true;
        await this.runner.promise.finally(() => {
            this.isRunning = false;
        });
    }
}
