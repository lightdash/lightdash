import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { lightdashConfig } from './config/lightdashConfig';
import { VERSION } from './version';

Sentry.init({
    release: VERSION,
    dsn: lightdashConfig.sentry.backend.dsn,
    environment:
        process.env.NODE_ENV === 'development'
            ? 'development'
            : lightdashConfig.mode,
    integrations: [
        // NOTE: Http, express, and postgres integrations are enabled by default
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
    ],
    ignoreErrors: [
        'WarehouseQueryError',
        'FieldReferenceError',
        'NotEnoughResults',
        'CompileError',
        'NotExistsError',
        'NotFoundError',
        'ForbiddenError',
        'TokenError',
    ],
    tracesSampler: (context) => {
        if (
            context.request?.url?.endsWith('/status') ||
            context.request?.url?.endsWith('/health') ||
            context.request?.url?.endsWith('/favicon.ico') ||
            context.request?.url?.endsWith('/robots.txt') ||
            context.request?.url?.endsWith('livez') ||
            context.request?.headers?.['user-agent']?.includes('GoogleHC')
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
