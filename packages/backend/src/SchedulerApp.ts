import { createTerminus } from '@godaddy/terminus';
import { NodeSDK } from '@opentelemetry/sdk-node';
import * as Sentry from '@sentry/node';
import express from 'express';
import http from 'http';
import { LightdashAnalytics } from './analytics/LightdashAnalytics';
import { S3Client } from './clients/Aws/s3';
import { S3CacheClient } from './clients/Aws/S3CacheClient';
import { ClientManifest } from './clients/clients';
import DbtCloudGraphqlClient from './clients/dbtCloud/DbtCloudGraphqlClient';
import EmailClient from './clients/EmailClient/EmailClient';
import { GoogleDriveClient } from './clients/Google/GoogleDriveClient';
import { SlackClient } from './clients/Slack/SlackClient';
import { LightdashConfig } from './config/parseConfig';
import Logger from './logging/logger';
import { schedulerModel, slackAuthenticationModel } from './models/models';
import { SchedulerClient } from './scheduler/SchedulerClient';
import { SchedulerWorker } from './scheduler/SchedulerWorker';
import { registerWorkerMetrics } from './schedulerMetrics';
import {
    OperationContext,
    ServiceProviderMap,
    ServiceRepository,
} from './services/ServiceRepository';
import { VERSION } from './version';

type SchedulerAppArguments = {
    lightdashConfig: LightdashConfig;
    port: string | number;
    environment?: 'production' | 'development';
    otelSdk: NodeSDK;
    serviceProviders?: ServiceProviderMap;
};

export default class SchedulerApp {
    private readonly serviceRepository: ServiceRepository;

    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly port: string | number;

    private readonly environment: 'production' | 'development';

    private readonly otelSdk: NodeSDK;

    private readonly clients: ClientManifest;

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
        this.clients = {
            dbtCloudGraphqlClient: new DbtCloudGraphqlClient(),
            emailClient: new EmailClient({
                lightdashConfig: this.lightdashConfig,
            }),
            googleDriveClient: new GoogleDriveClient({
                lightdashConfig: this.lightdashConfig,
            }),
            s3CacheClient: new S3CacheClient({
                lightdashConfig: this.lightdashConfig,
            }),
            s3Client: new S3Client({
                lightdashConfig: this.lightdashConfig,
            }),
            schedulerClient: new SchedulerClient({
                lightdashConfig: this.lightdashConfig,
                analytics: this.analytics,
                schedulerModel,
            }),
            slackClient: new SlackClient({
                slackAuthenticationModel,
                lightdashConfig: this.lightdashConfig,
            }),
        };
        this.serviceRepository = new ServiceRepository({
            serviceProviders: args.serviceProviders,
            context: new OperationContext({
                lightdashAnalytics: this.analytics,
                lightdashConfig: this.lightdashConfig,
                operationId: 'SchedulerApp#ctor',
            }),
            clients: this.clients,
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
            // TODO: Do not use serviceRepository singleton:
            ...{
                unfurlService: this.serviceRepository.getUnfurlService(),
                csvService: this.serviceRepository.getCsvService(),
                dashboardService: this.serviceRepository.getDashboardService(),
                projectService: this.serviceRepository.getProjectService(),
                schedulerService: this.serviceRepository.getSchedulerService(),
                validationService:
                    this.serviceRepository.getValidationService(),
                userService: this.serviceRepository.getUserService(),
            },
            ...this.clients,
        });
        registerWorkerMetrics(this.clients.schedulerClient);
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
