import './tracing/bootstrap'; // Must run before modules that can load Knex
import { lightdashConfig } from './config/lightdashConfig';
import { getEnterpriseAppArguments } from './ee';
import knexConfig from './knexfile';
import Logger from './logging/logger';
import { getLegacyStreamArgs, getRegisteredStreams } from './nats/natsConfig';
import NatsWorkerApp from './NatsWorkerApp';

// Winston (handleExceptions/handleRejections in winston.ts) owns structured logging
// for both events. Logger uses exitOnError: false so rejections are tolerated.
// We still want uncaught exceptions to terminate — process state may be corrupt.
process.on('uncaughtException', () => {
    process.exit(1);
});

(async () => {
    if (process.env.CI !== 'true') {
        const eeArgs = await getEnterpriseAppArguments();
        // Every worker consumes every registered stream, so a pinned fleet
        // can never leave one unconsumed. Per-stream pull loops are sized
        // with NATS_WORKER_CONCURRENCY_<STREAM>.
        const streams = getRegisteredStreams();
        const legacyStreamArgs = getLegacyStreamArgs(process.argv.slice(2));
        if (legacyStreamArgs.length > 0) {
            Logger.warn(
                `The --stream flag (${legacyStreamArgs.join(', ')}) is no longer supported and was ignored: this worker consumes every registered stream (${streams.join(', ')}). Remove it from the worker command.`,
            );
        }
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
