import { createTerminus } from '@godaddy/terminus';
import * as Sentry from '@sentry/node';
import express from 'express';
import http from 'http';
import knex, { Knex } from 'knex';
import { LightdashAnalytics } from './analytics/LightdashAnalytics';
import { registerOAuthRefreshStrategies } from './auth/registerOAuthRefreshStrategies';
import { createCacheClient } from './clients/CacheClient';
import {
    ClientProviderMap,
    ClientRepository,
} from './clients/ClientRepository';
import { type NatsClient } from './clients/NatsClient';
import { LightdashConfig } from './config/parseConfig';
import Logger from './logging/logger';
import { ModelProviderMap, ModelRepository } from './models/ModelRepository';
import { STREAM_CONFIGS, type NatsWorkerStream } from './nats/natsConfig';
import { NatsWorker } from './nats/NatsWorker';
import PrometheusMetrics from './prometheus/PrometheusMetrics';
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
    natsClient: NatsClient;
    serviceRepository: ServiceRepository;
    streams: NatsWorkerStream[];
}) =>
    new NatsWorker({
        natsClient: context.natsClient,
        asyncQueryService: context.serviceRepository.getAsyncQueryService(),
        streams: context.streams,
        workerConcurrency: context.lightdashConfig.natsWorker.workerConcurrency,
    });

/**
 * Separate from SchedulerApp intentionally — SchedulerApp carries Graphile,
 * Prometheus, passport refresh strategies, and many more service deps.
 * Extracting a shared base would couple the two for little benefit.
 */
export default class NatsWorkerApp {
    private readonly serviceRepository: ServiceRepository;

    private readonly clients: ClientRepository;

    private readonly modelRepository: ModelRepository;

    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly port: string | number;

    private readonly environment: 'production' | 'development';

    private readonly database: Knex;

    private readonly streams: NatsWorkerStream[];

    private readonly natsWorkerFactory: typeof natsWorkerFactory;

    private readonly prometheusMetrics: PrometheusMetrics;

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
        const keyValueCacheClient = createCacheClient(
            this.lightdashConfig.redis,
        );
        const models = new ModelRepository({
            modelProviders: args.modelProviders,
            lightdashConfig: this.lightdashConfig,
            database: this.database,
            utils,
            keyValueCacheClient,
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
        this.prometheusMetrics = new PrometheusMetrics(
            this.lightdashConfig.prometheus,
        );

        this.clients = clients;
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
            prometheusMetrics: this.prometheusMetrics,
        });
        this.streams = args.streams;
        this.natsWorkerFactory = args.natsWorkerFactory || natsWorkerFactory;
    }

    public async start() {
        registerOAuthRefreshStrategies();
        this.prometheusMetrics.start();
        this.prometheusMetrics.monitorDatabase(this.database);
        // @ts-ignore
        // eslint-disable-next-line no-extend-native, func-names
        BigInt.prototype.toJSON = function () {
            return this.toString();
        };
        await this.initSentry();
        const { worker, natsClient } = await this.initWorker();
        await this.initServer(worker, natsClient);
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
            tracesSampleRate:
                this.lightdashConfig.sentry.queryTracesSampleRate ??
                this.lightdashConfig.sentry.tracesSampleRate,
        });
    }

    private async initWorker(): Promise<{
        worker: NatsWorker;
        natsClient: NatsClient;
    }> {
        const natsClient = this.clients.getNatsClient();
        await natsClient.connect();
        await natsClient.ensureStreamsAndConsumers(
            this.streams.map((stream) => STREAM_CONFIGS[stream]),
        );

        const worker = this.natsWorkerFactory({
            lightdashConfig: this.lightdashConfig,
            natsClient,
            serviceRepository: this.serviceRepository,
            streams: this.streams,
        });
        await worker.run();
        return { worker, natsClient };
    }

    private async initServer(worker: NatsWorker, natsClient: NatsClient) {
        const app = express();
        const server = http.createServer(app);

        createTerminus(server, {
            signals: ['SIGUSR2', 'SIGTERM', 'SIGINT', 'SIGHUP', 'SIGABRT'],
            healthChecks: {
                '/api/v1/health': async () => {
                    if (await worker.isHealthy()) {
                        return 'NATS worker is running';
                    }

                    throw new Error(
                        'NATS worker not running or connection lost',
                    );
                },
                '/api/v1/livez': () => Promise.resolve(),
            },
            beforeShutdown: async () => {
                Logger.debug('Shutdown signal received');
                Logger.info('Shutting down NATS worker gracefully');
            },
            onSignal: async () => {
                Logger.info('Stopping Prometheus metrics');
                this.prometheusMetrics.stop();
                Logger.info('Stopping NATS worker');
                await worker.stop();
                await natsClient.drain();
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
