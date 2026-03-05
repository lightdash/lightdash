import { createTerminus } from '@godaddy/terminus';
import * as Sentry from '@sentry/node';
import express from 'express';
import http from 'http';
import knex, { Knex } from 'knex';
import { EventEmitter } from 'events';
import { LightdashAnalytics } from './analytics/LightdashAnalytics';
import { AsyncQueryNatsWorker } from './asyncQuery/AsyncQueryNatsWorker';
import {
    ClientProviderMap,
    ClientRepository,
} from './clients/ClientRepository';
import { LightdashConfig } from './config/parseConfig';
import Logger from './logging/logger';
import { ModelProviderMap, ModelRepository } from './models/ModelRepository';
import { IGNORE_ERRORS } from './sentry';
import {
    OperationContext,
    ServiceProviderMap,
    ServiceRepository,
} from './services/ServiceRepository';
import { UtilProviderMap, UtilRepository } from './utils/UtilRepository';
import { VERSION } from './version';

type AsyncQueryWorkerAppArguments = {
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
    asyncQueryWorkerFactory?: typeof asyncQueryWorkerFactory;
};

const asyncQueryWorkerFactory = (context: {
    lightdashConfig: LightdashConfig;
    serviceRepository: ServiceRepository;
}) =>
    new AsyncQueryNatsWorker({
        lightdashConfig: context.lightdashConfig,
        asyncQueryService: context.serviceRepository.getAsyncQueryService(),
    });

export default class AsyncQueryWorkerApp {
    private readonly serviceRepository: ServiceRepository;

    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly port: string | number;

    private readonly environment: 'production' | 'development';

    private readonly database: Knex;

    private readonly asyncQueryWorkerFactory: typeof asyncQueryWorkerFactory;

    constructor(args: AsyncQueryWorkerAppArguments) {
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
                operationId: 'AsyncQueryWorkerApp#ctor',
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
                operationId: 'AsyncQueryWorkerApp#ctor',
            }),
            clients,
            models,
            utils,
        });
        this.asyncQueryWorkerFactory =
            args.asyncQueryWorkerFactory || asyncQueryWorkerFactory;
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

    private async initWorker(): Promise<AsyncQueryNatsWorker> {
        const worker = this.asyncQueryWorkerFactory({
            lightdashConfig: this.lightdashConfig,
            serviceRepository: this.serviceRepository,
        });
        await worker.run();
        return worker;
    }

    private async initServer(worker: AsyncQueryNatsWorker) {
        const app = express();
        const server = http.createServer(app);

        createTerminus(server, {
            signals: ['SIGUSR2', 'SIGTERM', 'SIGINT', 'SIGHUP', 'SIGABRT'],
            healthChecks: {
                '/api/v1/health': () =>
                    new Promise((resolve, reject) => {
                        if (worker.isRunning) {
                            resolve('Async query worker is running');
                        } else {
                            reject(new Error('Async query worker not running'));
                        }
                    }),
                '/api/v1/livez': () => Promise.resolve(),
            },
            beforeShutdown: async () => {
                Logger.debug('Shutdown signal received');
                Logger.info('Shutting down async query worker gracefully');
            },
            onSignal: async () => {
                Logger.info('Stopping async query worker');
                await worker.stop();
            },
            onShutdown: async () => {
                Logger.info('Async query worker shutdown complete');
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
