import * as Sentry from '@sentry/node';
import { JobHelpers, parseCrontab, run } from 'graphile-worker';
import { slackService } from '.';
import { lightdashConfig } from './config/lightdashConfig';
import Logger from './logger';
import { SchedulerWorker } from './scheduler/SchedulerWorker';
import { slackClient } from './services/services';
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

if (process.env.CI !== 'true') {
    SchedulerWorker.run();
} else {
    Logger.info('Not running scheduler on CI');
}
