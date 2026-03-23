import { z } from 'zod';
import { lightdashConfig } from './config/lightdashConfig';
import { getEnterpriseAppArguments } from './ee';
import knexConfig from './knexfile';
import Logger from './logging/logger';
import {
    getRegisteredStreams,
    natsWorkerStreamSchema,
    type NatsWorkerStream,
} from './nats/natsConfig';
import NatsWorkerApp from './NatsWorkerApp';

const parseStreams = (): NatsWorkerStream[] => {
    const streams: NatsWorkerStream[] = [];
    const args = process.argv.slice(2);
    args.forEach((arg, i) => {
        if (arg === '--stream' && args[i + 1]) {
            streams.push(natsWorkerStreamSchema.parse(args[i + 1]));
        }
    });
    return streams.length > 0 ? streams : getRegisteredStreams();
};

process
    .on('unhandledRejection', (reason, p) => {
        Logger.error('Unhandled Rejection at Promise', reason, p);
    })
    .on('uncaughtException', (err) => {
        Logger.error('Uncaught Exception thrown', err);
        process.exit(1);
    });

(async () => {
    if (process.env.CI !== 'true') {
        const eeArgs = await getEnterpriseAppArguments();
        const streams = parseStreams();
        const natsWorkerApp = new NatsWorkerApp({
            lightdashConfig,
            port: process.env.NATS_WORKER_PORT || process.env.PORT || 8082,
            environment:
                process.env.NODE_ENV === 'development'
                    ? 'development'
                    : 'production',
            knexConfig,
            streams,
            clientProviders: eeArgs.clientProviders,
            serviceProviders: eeArgs.serviceProviders,
            modelProviders: eeArgs.modelProviders,
        });

        natsWorkerApp.start().catch((e) => {
            Logger.error('Error starting NATS worker', e);
        });
    } else {
        Logger.info('Not running NATS worker on CI');
    }
})();
