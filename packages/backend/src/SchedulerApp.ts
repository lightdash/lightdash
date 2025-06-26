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
import { IGNORE_ERRORS } from './sentry';
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
    schedulerWorkerFactory?: typeof schedulerWorkerFactory;
};

const schedulerWorkerFactory = (context: {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    serviceRepository: ServiceRepository;
    models: ModelRepository;
    clients: ClientRepository;
    utils: UtilRepository;
}) =>
    new SchedulerWorker({
        lightdashConfig: context.lightdashConfig,
        analytics: context.analytics,
        unfurlService: context.serviceRepository.getUnfurlService(),
        csvService: context.serviceRepository.getCsvService(),
        dashboardService: context.serviceRepository.getDashboardService(),
        projectService: context.serviceRepository.getProjectService(),
        schedulerService: context.serviceRepository.getSchedulerService(),
        validationService: context.serviceRepository.getValidationService(),
        userService: context.serviceRepository.getUserService(),
        emailClient: context.clients.getEmailClient(),
        googleDriveClient: context.clients.getGoogleDriveClient(),
        s3Client: context.clients.getS3Client(),
        schedulerClient: context.clients.getSchedulerClient(),
        slackClient: context.clients.getSlackClient(),
        catalogService: context.serviceRepository.getCatalogService(),
        encryptionUtil: context.utils.getEncryptionUtil(),
        msTeamsClient: context.clients.getMsTeamsClient(),
        renameService: context.serviceRepository.getRenameService(),
        asyncQueryService: context.serviceRepository.getAsyncQueryService(),
    });

export default class SchedulerApp {
    private readonly serviceRepository: ServiceRepository;

    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly port: string | number;

    private readonly environment: 'production' | 'development';

    private readonly clients: ClientRepository;

    private readonly utils: UtilRepository;

    private readonly prometheusMetrics: PrometheusMetrics;

    private readonly models: ModelRepository;

    private readonly database: Knex;

    private readonly schedulerWorkerFactory: typeof schedulerWorkerFactory;

    constructor(args: SchedulerAppArguments) {
        this.lightdashConfig = args.lightdashConfig;
        this.port = args.port;
        this.environment = args.environment || 'production';
        this.analytics = new LightdashAnalytics({
            lightdashConfig: this.lightdashConfig,
            writeKey: this.lightdashConfig.rudder.writeKey || 'notrack',
            dataPlaneUrl: this.lightdashConfig.rudder.dataPlaneUrl
                ? this.lightdashConfig.rudder.dataPlaneUrl
                : 'notrack',
            options: {
                enable:
                    this.lightdashConfig.rudder.writeKey &&
                    this.lightdashConfig.rudder.dataPlaneUrl,
            },
        });

        this.database = knex(
            this.environment === 'production'
                ? args.knexConfig.production
                : args.knexConfig.development,
        );

        const utils = new UtilRepository({
            utilProviders: args.utilProviders,
            lightdashConfig: this.lightdashConfig,
        });
        this.models = new ModelRepository({
            modelProviders: args.modelProviders,
            lightdashConfig: this.lightdashConfig,
            database: this.database,
            utils,
        });

        this.clients = new ClientRepository({
            clientProviders: args.clientProviders,
            context: new OperationContext({
                operationId: 'SchedulerApp#ctor',
                lightdashAnalytics: this.analytics,
                lightdashConfig: this.lightdashConfig,
            }),
            models: this.models,
        });
        this.serviceRepository = new ServiceRepository({
            serviceProviders: args.serviceProviders,
            context: new OperationContext({
                lightdashAnalytics: this.analytics,
                lightdashConfig: this.lightdashConfig,
                operationId: 'SchedulerApp#ctor',
            }),
            clients: this.clients,
            models: this.models,
            utils,
        });
        this.prometheusMetrics = new PrometheusMetrics(
            this.lightdashConfig.prometheus,
        );
        this.schedulerWorkerFactory =
            args.schedulerWorkerFactory || schedulerWorkerFactory;
        this.utils = utils;
    }

    public async start() {
        this.prometheusMetrics.start();
        this.prometheusMetrics.monitorDatabase(this.database);
        // @ts-ignore
        // eslint-disable-next-line no-extend-native, func-names
        BigInt.prototype.toJSON = function () {
            return this.toString();
        };
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
            ignoreErrors: IGNORE_ERRORS,
        });
    }

    private async initWorker() {
        const worker = this.schedulerWorkerFactory({
            lightdashConfig: this.lightdashConfig,
            analytics: this.analytics,
            serviceRepository: this.serviceRepository,
            models: this.models,
            clients: this.clients,
            utils: this.utils,
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
            useExit0: true,
            logger: Logger.error,
            sendFailuresDuringShutdown: true,
            onSendFailureDuringShutdown: async () => {
                Logger.debug('Returning 503 due to shutdown');
            },
        });

        server.listen(this.port);
    }
}
