import { createTerminus } from '@godaddy/terminus';
import { NodeSDK } from '@opentelemetry/sdk-node';
import * as Sentry from '@sentry/node';
import express from 'express';
import http from 'http';
import { LightdashAnalytics } from './analytics/LightdashAnalytics';
import * as clients from './clients/clients';
import { LightdashConfig } from './config/parseConfig';
import Logger from './logging/logger';
import { SchedulerWorker } from './scheduler/SchedulerWorker';
import { registerWorkerMetrics } from './schedulerMetrics';
import * as services from './services/services';
import { VERSION } from './version';

type SchedulerAppArguments = {
    lightdashConfig: LightdashConfig;
    port: string | number;
    environment?: 'production' | 'development';
    otelSdk: NodeSDK;
};

export default class SchedulerApp {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly port: string | number;

    private readonly environment: 'production' | 'development';

    private readonly otelSdk: NodeSDK;

    constructor(args: SchedulerAppArguments) {
        this.lightdashConfig = args.lightdashConfig;
        this.port = args.port;
        this.otelSdk = args.otelSdk;
        this.environment = args.environment || 'production';
        this.analytics = new LightdashAnalytics({
            lightdashConfig: this.lightdashConfig,
            writeKey: this.lightdashConfig.rudder.writeKey || 'notrack',
            dataPlaneUrl: this.lightdashConfig.rudder.dataPlaneUrl
                ? `${this.lightdashConfig.rudder.dataPlaneUrl}/v1/batch`
                : 'notrack',
            options: {
                enable:
                    this.lightdashConfig.rudder.writeKey &&
                    this.lightdashConfig.rudder.dataPlaneUrl,
            },
        });
    }

    public async start() {
        await this.initSentry();
        const worker = await this.initWorker();
        await this.initServer(worker);
    }

    private async initSentry() {
        Sentry.init({
            release: VERSION,
            dsn: this.lightdashConfig.sentry.dsn,
            environment:
                this.environment === 'development'
                    ? 'development'
                    : this.lightdashConfig.mode,
            integrations: [],
            ignoreErrors: ['WarehouseQueryError', 'FieldReferenceError'],
        });
    }

    private async initWorker() {
        const worker = new SchedulerWorker({
            lightdashConfig: this.lightdashConfig,
            analytics: this.analytics,
            ...services,
            ...clients,
        });
        registerWorkerMetrics();
        await worker.run();
        return worker;
    }

    private async initServer(worker: SchedulerWorker) {
        const app = express();
        const server = http.createServer(app);

        createTerminus(server, {
            signals: ['SIGUSR2', 'SIGTERM', 'SIGINT', 'SIGHUP', 'SIGABRT'],
            healthChecks: {
                '/api/v1/health': () =>
                    new Promise((resolve, reject) => {
                        if (worker && worker.runner && worker.isRunning) {
                            resolve('Scheduler worker is running');
                        } else {
                            reject(new Error('Scheduler worker not running'));
                        }
                    }),
                '/api/v1/livez': () => Promise.resolve(),
            },
            onSignal: async () => {
                Logger.debug('SIGTERM signal received: closing HTTP server');
                if (worker && worker.runner) {
                    await worker?.runner?.stop();
                }
                try {
                    await this.otelSdk.shutdown();
                    Logger.debug('OpenTelemetry SDK has been shutdown');
                } catch (e) {
                    Logger.error('Error shutting down OpenTelemetry SDK', e);
                }
            },
            logger: Logger.error,
        });

        server.listen(this.port);
    }
}
