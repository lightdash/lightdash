import { createTerminus } from '@godaddy/terminus';
import * as Sentry from '@sentry/node';
import express from 'express';
import * as http from 'http';
import { lightdashConfig } from './config/lightdashConfig';
import Logger from './logger';
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

let worker: SchedulerWorker;
if (process.env.CI !== 'true') {
    worker = new SchedulerWorker({ lightdashConfig });
    worker.run().catch((e) => {
        Logger.error('Error starting standalone scheduler worker', e);
    });
} else {
    Logger.info('Not running scheduler on CI');
}

const app = express();
const server = http.createServer(app);

async function onSignal() {
    Logger.debug('SIGTERM signal received: closing HTTP server');
    if (worker && worker.runner) {
        await worker?.runner?.stop();
    }
}

async function onHealthCheck() {
    return new Promise((resolve, reject) => {
        if (worker && worker.runner && worker.isRunning) {
            resolve('Scheduler worker is running');
        } else {
            reject(new Error('Scheduler worker not running'));
        }
    });
}

createTerminus(server, {
    signal: 'SIGINT',
    healthChecks: {
        '/api/v1/health': onHealthCheck,
        '/api/v1/livez': () => Promise.resolve(),
    },
    onSignal,
    logger: Logger.error,
});

server.listen(process.env.PORT || 8081);
