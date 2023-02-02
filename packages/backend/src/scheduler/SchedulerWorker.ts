import {
    JobHelpers,
    parseCrontab,
    run as runGraphileWorker,
} from 'graphile-worker';
import { LightdashConfig } from '../config/parseConfig';
import Logger from '../logger';
import { slackClient } from '../services/services';

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
            parsedCronItems: parseCrontab(
                '0 0 * * * generateDailyJobs ?fill=12h&max=1',
            ), // Generate daily jobs every day at 00:00

            // you can set the taskList or taskDirectory but not both
            taskList: {
                generateDailyJobs: async (
                    payload: unknown,
                    helpers: JobHelpers,
                ) => {
                    Logger.info(' generateDailyJobs', payload);
                },
                sendSlackMessage: async (payload: any, helpers: JobHelpers) => {
                    Logger.info(' sendSlackMessage', payload);
                    slackClient.sendNotification(payload);
                },
            },
        });
        await runner.promise;
    }
}
