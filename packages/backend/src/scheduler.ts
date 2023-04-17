import * as Sentry from '@sentry/node';
import { SlackService } from './clients/Slack/Slackbot';
import { lightdashConfig } from './config/lightdashConfig';
import Logger from './logger';
import { slackAuthenticationModel } from './models/models';
import { SchedulerWorker } from './scheduler/SchedulerWorker';
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

const slackService = new SlackService({
    slackAuthenticationModel,
    lightdashConfig,
});

if (process.env.CI !== 'true') {
    const worker = new SchedulerWorker({ lightdashConfig });
    worker.run().catch((e) => {
        Logger.error('Error starting standalone scheduler worker', e);
    });
} else {
    Logger.info('Not running scheduler on CI');
}
