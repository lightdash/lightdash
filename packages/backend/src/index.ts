import { getErrorMessage } from '@lightdash/common';
import App from './App';
import { lightdashConfig } from './config/lightdashConfig';
import { getEnterpriseAppArguments } from './ee';
import knexConfig from './knexfile';
import Logger from './logging/logger';

// trigger BE tests

process.on('unhandledRejection', (reason, p) => {
    Logger.error('Unhandled Rejection at Promise', reason, p);
});
process.on('uncaughtException', (err) => {
    Logger.error('Uncaught Exception thrown', err);
    process.exit(1);
});

(async () => {
    try {
        const app = new App({
            lightdashConfig,
            port: process.env.PORT || 8080,
            environment:
                process.env.NODE_ENV === 'development'
                    ? 'development'
                    : 'production',
            knexConfig,
            ...(await getEnterpriseAppArguments()),
        });

        const onExit = () => {
            app.stop()
                .catch((e) => {
                    Logger.error('Error stopping server', e);
                })
                .finally(() => {
                    process.exit();
                });
        };

        process.on('SIGUSR2', onExit);
        process.on('SIGINT', onExit);
        process.on('SIGTERM', onExit);
        process.on('SIGHUP', onExit);
        process.on('SIGABRT', onExit);

        Logger.info('Starting Lightdash server...');
        await app.start();
    } catch (error) {
        Logger.error(`Failed to start Lightdash: ${getErrorMessage(error)}`);
        console.error(`Failed to start Lightdash:`, error);
        process.exit(1);
    }
})();
