import { createTerminus } from '@godaddy/terminus';
import * as Sentry from '@sentry/node';
import express from 'express';
import http from 'http';
import knex, { Knex } from 'knex';
import { LightdashAnalytics } from './analytics/LightdashAnalytics';
import {
    ClientProviderMap,
    ClientRepository,
} from './clients/ClientRepository';
import { LightdashConfig } from './config/parseConfig';
import Logger from './logging/logger';
import { ModelProviderMap, ModelRepository } from './models/ModelRepository';
import PrometheusMetrics from './prometheus';
import { SchedulerWorker } from './scheduler/SchedulerWorker';
import {
    OperationContext,
    ServiceProviderMap,
    ServiceRepository,
} from './services/ServiceRepository';
import { UtilProviderMap, UtilRepository } from './utils/UtilRepository';
import { VERSION } from './version';

type SchedulerAppArguments = {
    lightdashConfig: LightdashConfig;
    port: string | number;
    environment?: 'production' | 'development';
    serviceProviders?: ServiceProviderMap;
    knexConfig: {
        production: Knex.Config<Knex.PgConnectionConfig>;
        development: Knex.Config<Knex.PgConnectionConfig>;
    };
    clientProviders?: ClientProviderMap;
    modelProviders?: ModelProviderMap;
    utilProviders?: UtilProviderMap;
};

export default class SchedulerApp {
    private readonly serviceRepository: ServiceRepository;

    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly port: string | number;

    private readonly environment: 'production' | 'development';

    private readonly clients: ClientRepository;

    private readonly prometheusMetrics: PrometheusMetrics;

    constructor(args: SchedulerAppArguments) {
        this.lightdashConfig = args.lightdashConfig;
        this.port = args.port;
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

        const database = knex(
            this.environment === 'production'
                ? args.knexConfig.production
                : args.knexConfig.development,
        );

        const utils = new UtilRepository({
            utilProviders: args.utilProviders,
            lightdashConfig: this.lightdashConfig,
        });
        const models = new ModelRepository({
            modelProviders: args.modelProviders,
            lightdashConfig: this.lightdashConfig,
            database,
            utils,
        });

        this.clients = new ClientRepository({
            clientProviders: args.clientProviders,
            context: new OperationContext({
                operationId: 'SchedulerApp#ctor',
                lightdashAnalytics: this.analytics,
                lightdashConfig: this.lightdashConfig,
            }),
            models,
        });
        this.serviceRepository = new ServiceRepository({
            serviceProviders: args.serviceProviders,
            context: new OperationContext({
                lightdashAnalytics: this.analytics,
                lightdashConfig: this.lightdashConfig,
                operationId: 'SchedulerApp#ctor',
            }),
            clients: this.clients,
            models,
        });
        this.prometheusMetrics = new PrometheusMetrics(
            this.lightdashConfig.prometheus,
        );
    }

    public async start() {
        this.prometheusMetrics.start();
        await this.initSentry();
        const worker = await this.initWorker();
        this.prometheusMetrics.monitorQueues(this.clients.getSchedulerClient());
        await this.initServer(worker);
    }

    private async initSentry() {
        Sentry.init({
            release: VERSION,
            dsn: this.lightdashConfig.sentry.backend.dsn,
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
            ...{
                emailClient: this.clients.getEmailClient(),
                googleDriveClient: this.clients.getGoogleDriveClient(),
                s3Client: this.clients.getS3Client(),
                schedulerClient: this.clients.getSchedulerClient(),
                slackClient: this.clients.getSlackClient(),
            },
        });
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
            beforeShutdown: async () => {
                Logger.debug('Shutdown signal received');
                Logger.info('Shutting down gracefully');
            },
            onSignal: async () => {
                Logger.info('Stopping Prometheus metrics');
                this.prometheusMetrics.stop();
                if (worker && worker.runner) {
                    Logger.info('Stopping scheduler worker');
                    await worker?.runner?.stop();
                }
            },
            onShutdown: async () => {
                Logger.info('Shutdown complete');
            },
            logger: Logger.error,
            sendFailuresDuringShutdown: true,
            onSendFailureDuringShutdown: async () => {
                Logger.debug('Returning 503 due to shutdown');
            },
        });

        server.listen(this.port);
    }
}
