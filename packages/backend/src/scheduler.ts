import './tracing/bootstrap'; // Must run before modules that can load Knex
import { lightdashConfig } from './config/lightdashConfig';
import { getEnterpriseAppArguments } from './ee';
import knexConfig from './knexfile';
import Logger from './logging/logger';
import { buildRuntimeMemoryReport } from './logging/runtimeMemory';
import SchedulerApp from './SchedulerApp';
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

// Winston (handleExceptions/handleRejections in winston.ts) owns structured logging
// for both events. Logger uses exitOnError: false so rejections are tolerated.
// We still want uncaught exceptions to terminate — process state may be corrupt.
process.on('uncaughtException', () => {
    process.exit(1);
});

(async () => {
    if (process.env.CI !== 'true') {
        const timezoneWarning = getProcessTimezoneWarning({
            enableTimezoneSupport:
                lightdashConfig.query.enableTimezoneSupport !== false,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        });
        if (timezoneWarning) {
            Logger.warn(timezoneWarning);
        }

        logRuntimeMemory('scheduler');
        const schedulerApp = new SchedulerApp({
            lightdashConfig,
            port: process.env.PORT || 8081,
            environment:
                process.env.NODE_ENV === 'development'
                    ? 'development'
                    : 'production',
            knexConfig,
            ...(await getEnterpriseAppArguments()),
        });
        schedulerApp.start().catch((e) => {
            Logger.error('Error starting standalone scheduler worker', e);
        });
    } else {
        Logger.info('Not running scheduler on CI');
    }
})();
