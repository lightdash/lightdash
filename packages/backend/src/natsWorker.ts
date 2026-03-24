import { lightdashConfig } from './config/lightdashConfig';
import { getEnterpriseAppArguments } from './ee';
import knexConfig from './knexfile';
import Logger from './logging/logger';
import { type NatsStreamKey } from './nats/NatsContract';
import NatsWorkerApp from './NatsWorkerApp';

const getAvailableStreamKeys = (): NatsStreamKey[] =>
    lightdashConfig.preAggregates.enabled &&
    !!lightdashConfig.license.licenseKey
        ? ['warehouse', 'pre-aggregate']
        : ['warehouse'];

const isAvailableStreamKey = (
    streamKey: string,
    availableStreamKeys: readonly NatsStreamKey[],
): streamKey is NatsStreamKey =>
    availableStreamKeys.some(
        (availableStreamKey) => availableStreamKey === streamKey,
    );

const parseStreams = (): NatsStreamKey[] => {
    const availableStreamKeys = getAvailableStreamKeys();
    const streams: NatsStreamKey[] = [];
    const unknownStreams: string[] = [];
    const args = process.argv.slice(2);

    args.forEach((arg, i) => {
        const streamKey = args[i + 1];
        if (arg === '--stream' && streamKey) {
            if (isAvailableStreamKey(streamKey, availableStreamKeys)) {
                streams.push(streamKey);
            } else {
                unknownStreams.push(streamKey);
            }
        }
    });

    if (unknownStreams.length > 0) {
        throw new Error(
            `Unknown NATS stream key(s): ${unknownStreams.join(', ')}. Available streams: ${availableStreamKeys.join(', ')}`,
        );
    }

    return streams.length > 0 ? streams : availableStreamKeys;
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
