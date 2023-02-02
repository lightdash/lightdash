import {
    CronItem,
    JobHelpers,
    Logger as GraphileLogger,
    parseCronItems,
    parseCrontab,
    run as runGraphileWorker,
} from 'graphile-worker';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logger';
import { schedulerService, slackClient } from '../services/services';

type SchedulerWorkerDependencies = {
    lightdashConfig: LightdashConfig;
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
                        await runner.addJob(scheduler.name, {
                            ...scheduler,
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
