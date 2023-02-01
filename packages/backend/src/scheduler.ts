import * as Sentry from '@sentry/node';
import { parseCrontab, run } from 'graphile-worker';
import { lightdashConfig } from './config/lightdashConfig';
import Logger from './logger';
import { VERSION } from './version';

process
    .on('unhandledRejection', (reason, p) => {
        Logger.error('Unhandled Rejection at Promise', reason, p);
    })
    .on('uncaughtException', (err) => {
        Logger.error('Uncaught Exception thrown', err);
        process.exit(1);
    });

Sentry.init({
    release: VERSION,
    dsn: process.env.SENTRY_DSN,
    environment:
        process.env.NODE_ENV === 'development'
            ? 'development'
            : lightdashConfig.mode,
    integrations: [],
    ignoreErrors: ['WarehouseQueryError', 'FieldReferenceError'],
});

async function main() {
    // Run a worker to execute jobs:
    const runner = await run({
        concurrency: 2,
        // Install signal handlers for graceful shutdown on SIGINT, SIGTERM, etc
        noHandleSignals: false,
        pollInterval: 1000,
        parsedCronItems: parseCrontab('0 0 * * * generateDailyJobs'), // Generate daily jobs every day at 00:00

        // you can set the taskList or taskDirectory but not both
        taskList: {
            hello: async (payload: any, helpers: any) => {
                const { name } = payload;
                helpers.logger.info(`Hello, ${name}`);
            },
            generateDailyJobs: async (payload: any, helpers: any) => {
                Logger.info(' generateDailyJobs', payload);
            },
        },

        // or:
        //   taskDirectory: `${__dirname}/tasks`,
    });
    // Immediately await (or otherwise handled) the resulting promise, to avoid
    // "unhandled rejection" errors causing a process crash in the event of
    // something going wrong.
    await runner.promise;
    // If the worker exits (whether through fatal error or otherwise), the above
    // promise will resolve/reject.
}

main().catch((err) => {
    Logger.error('Graphile worker failed', err);
    process.exit(1);
});
