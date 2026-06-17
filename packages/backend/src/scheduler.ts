import { lightdashConfig } from './config/lightdashConfig';
import { getEnterpriseAppArguments } from './ee';
import knexConfig from './knexfile';
import Logger from './logging/logger';
import SchedulerApp from './SchedulerApp';
import { getProcessTimezoneWarning } from './utils/processTimezone';

// Winston (handleExceptions/handleRejections in winston.ts) owns structured logging
// for both events. Logger uses exitOnError: false so rejections are tolerated.
// We still want uncaught exceptions to terminate — process state may be corrupt.
process.on('uncaughtException', () => {
    process.exit(1);
});

(async () => {
    if (process.env.CI !== 'true') {
        const timezoneWarning = getProcessTimezoneWarning({
            enableTimezoneSupport: Boolean(
                lightdashConfig.query.enableTimezoneSupport,
            ),
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        });
        if (timezoneWarning) {
            Logger.warn(timezoneWarning);
        }

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
