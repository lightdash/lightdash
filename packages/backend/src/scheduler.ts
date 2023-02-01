import * as Sentry from '@sentry/node';
import { lightdashConfig } from './config/lightdashConfig';
import Logger from './logger';
import { VERSION } from './version';

const { run, parseCrontab } = require('graphile-worker');

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
        // crontab: '* * * * * generateJobs',
        parsedCronItems: parseCrontab('* * * * * generateJobs'), // not working ?

        // you can set the taskList or taskDirectory but not both
        taskList: {
            hello: async (payload: any, helpers: any) => {
                const { name } = payload;
                helpers.logger.info(`Hello, ${name}`);
            },
        },
        generateJobs: async (payload: any, helpers: any) => {
            Logger.info(' generateJobs', payload);
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
