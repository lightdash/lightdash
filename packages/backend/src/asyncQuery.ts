import AsyncQueryWorkerApp from './AsyncQueryWorkerApp';
import { lightdashConfig } from './config/lightdashConfig';
import { getEnterpriseAppArguments } from './ee';
import knexConfig from './knexfile';
import Logger from './logging/logger';

process
    .on('unhandledRejection', (reason, p) => {
        Logger.error('Unhandled Rejection at Promise', reason, p);
    })
    .on('uncaughtException', (err) => {
        Logger.error('Uncaught Exception thrown', err);
        process.exit(1);
    });

(async () => {
    if (process.env.CI === 'true') {
        Logger.info('Not running async query worker on CI');
        return;
    }

    if (!lightdashConfig.asyncQuery.nats.enabled) {
        Logger.info('NATS is not enabled, async query worker will not start');
        process.exit(0);
    }

    const eeArgs = await getEnterpriseAppArguments();
    const asyncQueryWorkerApp = new AsyncQueryWorkerApp({
        lightdashConfig,
        port: process.env.PORT || 8082,
        environment:
            process.env.NODE_ENV === 'development'
                ? 'development'
                : 'production',
        knexConfig,
        clientProviders: eeArgs.clientProviders,
        serviceProviders: eeArgs.serviceProviders,
        modelProviders: eeArgs.modelProviders,
    });

    asyncQueryWorkerApp.start().catch((e) => {
        Logger.error('Error starting async query worker', e);
    });
})();
