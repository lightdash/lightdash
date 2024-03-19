// organize-imports-ignore
// eslint-disable-next-line import/order
import otelSdk from './otel'; // must be imported first
import { lightdashConfig } from './config/lightdashConfig';
import Logger from './logging/logger';
import SchedulerApp from './SchedulerApp';
import knexConfig from './knexfile';

process
    .on('unhandledRejection', (reason, p) => {
        Logger.error('Unhandled Rejection at Promise', reason, p);
    })
    .on('uncaughtException', (err) => {
        Logger.error('Uncaught Exception thrown', err);
        process.exit(1);
    });
if (process.env.CI !== 'true') {
    const schedulerApp = new SchedulerApp({
        lightdashConfig,
        port: process.env.PORT || 8081,
        environment:
            process.env.NODE_ENV === 'development'
                ? 'development'
                : 'production',
        otelSdk,
        knexConfig,
    });
    schedulerApp.start().catch((e) => {
        Logger.error('Error starting standalone scheduler worker', e);
    });
} else {
    Logger.info('Not running scheduler on CI');
}
