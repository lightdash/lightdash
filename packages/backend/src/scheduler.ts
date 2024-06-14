import { lightdashConfig } from './config/lightdashConfig';
import knexConfig from './knexfile';
import Logger from './logging/logger';
import SchedulerApp from './SchedulerApp';

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
        knexConfig,
    });
    schedulerApp.start().catch((e) => {
        Logger.error('Error starting standalone scheduler worker', e);
    });
} else {
    Logger.info('Not running scheduler on CI');
}
