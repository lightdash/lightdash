import './tracing/bootstrap'; // Must run before modules that can load Knex
import { lightdashConfig } from './config/lightdashConfig';
import { getEnterpriseAppArguments } from './ee';
import knexConfig from './knexfile';
import Logger from './logging/logger';
import { getRegisteredStreams } from './nats/natsConfig';
import { parseNatsWorkerStreams } from './nats/parseNatsWorkerStreams';
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
        const { streams, retiredStreams } = parseNatsWorkerStreams(
            process.argv.slice(2),
            getRegisteredStreams(),
        );
        if (retiredStreams.includes('duckdb')) {
            // Idle rather than crash-loop: the HTTP health server keeps the process up.
            Logger.warn(
                `NATS worker stream "duckdb" no longer exists: SQL transformations and merge queries now run in a sandbox started by the backend. Remove "--stream duckdb" from this worker.${
                    streams.length === 0
                        ? ' No other stream was requested, so this worker stays idle.'
                        : ''
                }`,
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
