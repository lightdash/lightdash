import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import * as Sentry from '@sentry/node';
import { getFloatFromEnvironmentVariable } from './config/parseConfig';

const sentry = Sentry.init({
    debug: true,
    // release: VERSION,
    dsn: process.env.SENTRY_BE_DSN,
    environment: 'development',
    // integrations: [nodeProfilingIntegration()],
    // tracesSampleRate: ,
    ignoreErrors: ['WarehouseQueryError', 'FieldReferenceError'],
    tracesSampler: (context) => {
        console.log('samplingContext', context);

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
        if (context.parentSampled !== undefined) {
            return context.parentSampled;
        }
        return (
            getFloatFromEnvironmentVariable('SENTRY_TRACES_SAMPLE_RATE') || 1.0
        );
    },
    // profilesSampleRate: this.lightdashConfig.sentry.profilesSampleRate, // x% of samples will be profiled
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

registerInstrumentations({
    instrumentations: [
        new RuntimeNodeInstrumentation({
            eventLoopUtilizationMeasurementInterval: 1000,
        }),
        getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-dns': {
                enabled: false,
            },
            '@opentelemetry/instrumentation-net': {
                enabled: false,
            },
            '@opentelemetry/instrumentation-http': {
                enabled: true,
                requireParentforOutgoingSpans: true,
                ignoreOutgoingRequestHook(req) {
                    const isAnalytics = !!req?.hostname?.endsWith(
                        'analytics.lightdash.com',
                    );
                    const isSentry =
                        !!req?.hostname?.endsWith('ingest.sentry.io');
                    return isAnalytics || isSentry;
                },
                ignoreIncomingRequestHook(req) {
                    // Ignore liveness checks
                    const isLivenessProbe =
                        !!req?.url?.match(/^\/api\/v1\/livez$/);
                    return isLivenessProbe;
                },
            },
            '@opentelemetry/instrumentation-express': {
                enabled: true,
                requestHook(span, info) {
                    if (
                        info.layerType === ExpressLayerType.MIDDLEWARE &&
                        !!info.request.user
                    ) {
                        span.setAttribute(
                            SemanticAttributes.ENDUSER_ID,
                            info.request.user.userUuid,
                        );
                        if (info.request.user.organizationUuid) {
                            span.setAttribute(
                                'enduser.org_id',
                                info.request.user.organizationUuid,
                            );
                        }
                    }
                },
            },
            '@opentelemetry/instrumentation-knex': {
                enabled: false,
            },
            '@opentelemetry/instrumentation-pg': {
                enabled: true,
                requireParentSpan: true,
            },
            '@opentelemetry/instrumentation-fs': {
                enabled: false,
            },
        }),
    ],
});

export default sentry;
