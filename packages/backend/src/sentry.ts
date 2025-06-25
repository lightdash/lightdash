import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { lightdashConfig } from './config/lightdashConfig';
import { VERSION } from './version';

export const IGNORE_ERRORS = [
    'WarehouseQueryError',
    'FieldReferenceError',
    'NotEnoughResults',
    'CompileError',
    'NotExistsError',
    'NotFoundError',
    'ForbiddenError',
    'TokenError',
    'AuthorizationError',
    'SshTunnelError',
    'ReadFileError',
];

Sentry.init({
    release: VERSION,
    dsn: lightdashConfig.sentry.backend.dsn,
    environment:
        process.env.NODE_ENV === 'development'
            ? 'development'
            : lightdashConfig.mode,
    integrations: [
        /**
         * Some integrations are enabled by default
         * @ref https://docs.sentry.io/platforms/javascript/guides/node/configuration/integrations/
         */
        nodeProfilingIntegration(),
        ...(lightdashConfig.sentry.anr.enabled
            ? [
                  Sentry.anrIntegration({
                      pollInterval: 50, // ms
                      anrThreshold: lightdashConfig.sentry.anr.timeout || 5000, // ms
                      captureStackTrace:
                          lightdashConfig.sentry.anr.captureStacktrace,
                  }),
              ]
            : []),
        ...(lightdashConfig.ai.copilot.enabled &&
        lightdashConfig.ai.copilot.telemetryEnabled
            ? [
                  Sentry.vercelAIIntegration({
                      recordInputs: true,
                      recordOutputs: true,
                  }),
              ]
            : []),
    ],
    ignoreErrors: IGNORE_ERRORS,
    tracesSampler: (context) => {
        const request = context.normalizedRequest;
        if (
            request?.url?.endsWith('/status') ||
            request?.url?.endsWith('/health') ||
            request?.url?.endsWith('/favicon.ico') ||
            request?.url?.endsWith('/robots.txt') ||
            request?.url?.endsWith('livez') ||
            request?.headers?.['user-agent']?.includes('GoogleHC')
        ) {
            return 0.0;
        }
        if (context.parentSampled) {
            return context.parentSampled;
        }

        return lightdashConfig.sentry.tracesSampleRate;
    },
    profilesSampleRate: lightdashConfig.sentry.profilesSampleRate, // x% of samples will be profiled
    beforeBreadcrumb(breadcrumb) {
        if (
            breadcrumb.category === 'http' &&
            breadcrumb?.data?.url &&
            new URL(breadcrumb?.data.url).host ===
                new URL('https://hub.docker.com').host
        ) {
            return null;
        }
        return breadcrumb;
    },
});
