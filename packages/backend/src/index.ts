import App from './App';
import { lightdashConfig } from './config/lightdashConfig';
import knexConfig from './knexfile';
import Logger from './logging/logger';

const app = new App({
    lightdashConfig,
    port: process.env.PORT || 8080,
    environment:
        process.env.NODE_ENV === 'development' ? 'development' : 'production',
    knexConfig,
});

process.on('unhandledRejection', (reason, p) => {
    Logger.error('Unhandled Rejection at Promise', reason, p);
});
process.on('uncaughtException', (err) => {
    Logger.error('Uncaught Exception thrown', err);
    process.exit(1);
});

function onExit() {
    app.stop()
        .catch((e) => {
            Logger.error('Error stopping server', e);
        })
        .finally(() => {
            process.exit();
        });
}

process.on('SIGUSR2', onExit);
process.on('SIGINT', onExit);
process.on('SIGTERM', onExit);
process.on('SIGHUP', onExit);
process.on('SIGABRT', onExit);

// Start the Lightdash server
app.start().catch((e) => {
    Logger.error('Error starting Lightdash', e);
});
