import { createTerminus } from '@godaddy/terminus';
import * as Sentry from '@sentry/node';
import { EventEmitter } from 'events';
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
import { NatsWorker, type NatsWorkerStream } from './nats/NatsWorker';
import { IGNORE_ERRORS } from './sentry';
import {
    OperationContext,
    ServiceProviderMap,
    ServiceRepository,
} from './services/ServiceRepository';
import { UtilProviderMap, UtilRepository } from './utils/UtilRepository';
import { VERSION } from './version';

type NatsWorkerAppArguments = {
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
    streams: NatsWorkerStream[];
    natsWorkerFactory?: typeof natsWorkerFactory;
};

const natsWorkerFactory = (context: {
    lightdashConfig: LightdashConfig;
    serviceRepository: ServiceRepository;
    modelRepository: ModelRepository;
    streams: NatsWorkerStream[];
}) =>
    new NatsWorker({
        lightdashConfig: context.lightdashConfig,
        asyncQueryService: context.serviceRepository.getAsyncQueryService(),
        queryHistoryModel: context.modelRepository.getQueryHistoryModel(),
        projectModel: context.modelRepository.getProjectModel(),
        streams: context.streams,
    });

export default class NatsWorkerApp {
    private readonly serviceRepository: ServiceRepository;

    private readonly modelRepository: ModelRepository;

    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly port: string | number;

    private readonly environment: 'production' | 'development';

    private readonly database: Knex;

    private readonly streams: NatsWorkerStream[];

    private readonly natsWorkerFactory: typeof natsWorkerFactory;

    constructor(args: NatsWorkerAppArguments) {
        this.lightdashConfig = args.lightdashConfig;
        this.port = args.port;
        this.environment = args.environment || 'production';

        this.analytics = new LightdashAnalytics({
            lightdashConfig: this.lightdashConfig,
            writeKey: this.lightdashConfig.rudder.writeKey || 'notrack',
            dataPlaneUrl: this.lightdashConfig.rudder.dataPlaneUrl || 'notrack',
            options: {
                enable:
                    !!this.lightdashConfig.rudder.writeKey &&
                    !!this.lightdashConfig.rudder.dataPlaneUrl,
            },
            eventEmitter: new EventEmitter(),
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
        const models = new ModelRepository({
            modelProviders: args.modelProviders,
            lightdashConfig: this.lightdashConfig,
            database: this.database,
            utils,
        });

        const clients = new ClientRepository({
            clientProviders: args.clientProviders,
            context: new OperationContext({
                operationId: 'NatsWorkerApp#ctor',
                lightdashAnalytics: this.analytics,
                lightdashConfig: this.lightdashConfig,
            }),
            models,
        });

        this.modelRepository = models;
        this.serviceRepository = new ServiceRepository({
            serviceProviders: args.serviceProviders,
            context: new OperationContext({
                lightdashAnalytics: this.analytics,
                lightdashConfig: this.lightdashConfig,
                operationId: 'NatsWorkerApp#ctor',
            }),
            clients,
            models,
            utils,
        });
        this.streams = args.streams;
        this.natsWorkerFactory = args.natsWorkerFactory || natsWorkerFactory;
    }

    public async start() {
        // @ts-ignore
        // eslint-disable-next-line no-extend-native, func-names
        BigInt.prototype.toJSON = function () {
            return this.toString();
        };
        await this.initSentry();
        const worker = await this.initWorker();
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

    private async initWorker(): Promise<NatsWorker> {
        const worker = this.natsWorkerFactory({
            lightdashConfig: this.lightdashConfig,
            serviceRepository: this.serviceRepository,
            modelRepository: this.modelRepository,
            streams: this.streams,
        });
        await worker.run();
        return worker;
    }

    private async initServer(worker: NatsWorker) {
        const app = express();
        const server = http.createServer(app);

        createTerminus(server, {
            signals: ['SIGUSR2', 'SIGTERM', 'SIGINT', 'SIGHUP', 'SIGABRT'],
            healthChecks: {
                '/api/v1/health': () =>
                    new Promise((resolve, reject) => {
                        if (worker.isRunning) {
                            resolve('NATS worker is running');
                        } else {
                            reject(new Error('NATS worker not running'));
                        }
                    }),
                '/api/v1/livez': () => Promise.resolve(),
            },
            beforeShutdown: async () => {
                Logger.debug('Shutdown signal received');
                Logger.info('Shutting down NATS worker gracefully');
            },
            onSignal: async () => {
                Logger.info('Stopping NATS worker');
                await worker.stop();
            },
            onShutdown: async () => {
                Logger.info('NATS worker shutdown complete');
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
