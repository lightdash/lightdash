import './tracing/bootstrap'; // Must run before modules that can load Knex
import { getErrorMessage } from '@lightdash/common';
import App from './App';
import { lightdashConfig } from './config/lightdashConfig';
import { getEnterpriseAppArguments } from './ee';
import knexConfig from './knexfile';
import Logger from './logging/logger';
import { buildRuntimeMemoryReport } from './logging/runtimeMemory';
import { getProcessTimezoneWarning } from './utils/processTimezone';

const logRuntimeMemory = (service: 'api' | 'scheduler') => {
    const report = buildRuntimeMemoryReport();
    // The default log format renders the message and drops metadata, so the numbers ride in
    // both. This is the first thing worth knowing from any log about a failed compile.
    Logger.info(
        `lightdash.boot.memory service=${service} heapLimitMb=${Math.round(
            report.heapLimitBytes / 1024 / 1024,
        )} containerLimitMb=${
            report.containerMemoryLimitBytes === null
                ? 'unknown'
                : Math.round(report.containerMemoryLimitBytes / 1024 / 1024)
        } heapFlagSet=${report.heapFlagSet} availableParallelism=${
            report.availableParallelism
        }`,
        { event: 'lightdash.boot.memory', service, ...report },
    );
    if (report.warning) {
        Logger.warn(`lightdash.boot.memory ${report.warning}`, {
            event: 'lightdash.boot.memory.warning',
            service,
            ...report,
        });
    }
};

// trigger BE tests

// Winston (handleExceptions/handleRejections in winston.ts) owns structured logging
// for both events. Logger uses exitOnError: false so rejections are tolerated.
// We still want uncaught exceptions to terminate — process state may be corrupt.
process.on('uncaughtException', () => {
    process.exit(1);
});

(async () => {
    try {
        const timezoneWarning = getProcessTimezoneWarning({
            enableTimezoneSupport:
                lightdashConfig.query.enableTimezoneSupport !== false,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        });
        if (timezoneWarning) {
            Logger.warn(timezoneWarning);
        }

        const app = new App({
            lightdashConfig,
            port: process.env.PORT || 8080,
            environment:
                process.env.NODE_ENV === 'development'
                    ? 'development'
                    : 'production',
            knexConfig,
            ...(await getEnterpriseAppArguments()),
        });

        const onExit = () => {
            app.stop()
                .catch((e) => {
                    Logger.error('Error stopping server', e);
                })
                .finally(() => {
                    process.exit();
                });
        };

        process.on('SIGUSR2', onExit);
        process.on('SIGINT', onExit);
        process.on('SIGTERM', onExit);
        process.on('SIGHUP', onExit);
        process.on('SIGABRT', onExit);

        logRuntimeMemory('api');
        Logger.info('Starting Lightdash server...');
        await app.start();
    } catch (error) {
        Logger.error(`Failed to start Lightdash: ${getErrorMessage(error)}`);
        console.error(`Failed to start Lightdash:`, error);
        process.exit(1);
    }
})();
