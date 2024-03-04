// organize-imports-ignore
// eslint-disable-next-line import/order
import otelSdk from './otel'; // must be imported first

import { createTerminus } from '@godaddy/terminus';
import * as Sentry from '@sentry/node';
import express from 'express';
import * as http from 'http';
import { lightdashConfig } from './config/lightdashConfig';
import Logger from './logging/logger';
import { SchedulerWorker } from './scheduler/SchedulerWorker';
import { VERSION } from './version';
import { registerWorkerMetrics } from './schedulerMetrics';
import * as services from './services/services';
import * as clients from './clients/clients';
import { LightdashAnalytics } from './analytics/LightdashAnalytics';

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
    const analytics = new LightdashAnalytics({
        lightdashConfig,
        writeKey: lightdashConfig.rudder.writeKey || 'notrack',
        dataPlaneUrl: lightdashConfig.rudder.dataPlaneUrl
            ? `${lightdashConfig.rudder.dataPlaneUrl}/v1/batch`
            : 'notrack',
        options: {
            enable:
                lightdashConfig.rudder.writeKey &&
                lightdashConfig.rudder.dataPlaneUrl,
        },
    });
    worker = new SchedulerWorker({
        lightdashConfig,
        analytics,
        ...services,
        ...clients,
    });
    registerWorkerMetrics();
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
    try {
        await otelSdk.shutdown();
        Logger.debug('OpenTelemetry SDK has been shutdown');
    } catch (e) {
        Logger.error('Error shutting down OpenTelemetry SDK', e);
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
    signals: ['SIGUSR2', 'SIGTERM', 'SIGINT', 'SIGHUP', 'SIGABRT'],
    healthChecks: {
        '/api/v1/health': onHealthCheck,
        '/api/v1/livez': () => Promise.resolve(),
    },
    onSignal,
    logger: Logger.error,
});

server.listen(process.env.PORT || 8081);
