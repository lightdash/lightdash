import opentelemetry, { diag, DiagConsoleLogger } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';
import { gcpDetector } from '@opentelemetry/resource-detector-gcp';
import { envDetector, Resource } from '@opentelemetry/resources';
import {
    ConsoleMetricExporter,
    PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { core, NodeSDK } from '@opentelemetry/sdk-node';
import {
    SemanticAttributes,
    SemanticResourceAttributes,
} from '@opentelemetry/semantic-conventions';
import { VERSION } from './version';

// Default to no telemetry
process.env.OTEL_SDK_DISABLED = process.env.OTEL_SDK_DISABLED || 'true';

// Environment variable configuration
// OTEL_TRACES_EXPORTER=otlp
// OTEL_METRICS_EXPORTER=otlp
// OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
// OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
// OTEL_RESOURCE_ATTRIBUTES=service.name=lightdash,service.version=1.0.0

if (process.env.OTEL_SDK_DISABLED !== 'true') {
    diag.setLogger(new DiagConsoleLogger(), core.getEnv().OTEL_LOG_LEVEL);
}

const getMetricReader = (s: string | undefined) => {
    switch (s) {
        case 'otlp':
            return new PeriodicExportingMetricReader({
                // Expect OTLP to be configured by environment variables
                exporter: new OTLPMetricExporter({}),
            });
        case 'console':
            return new PeriodicExportingMetricReader({
                exporter: new ConsoleMetricExporter(),
            });
        default:
            return undefined;
    }
};

const sdk = new NodeSDK({
    // Trace exporter is auto configured based on environment variables

    // WORKAROUND: for https://github.com/open-telemetry/opentelemetry-js/issues/3193
    metricReader: getMetricReader(process.env.OTEL_METRICS_EXPORTER),

    // Instrumentations enable tracing/profiling of specific libraries.
    // Auto instrumentation includes http,express,knex,pg,winston
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
                requireParentSpan: true,
            },
            '@opentelemetry/instrumentation-fs': {
                enabled: false,
            },
        }),
    ],

    // Resource detection automatically sets resource attributes.
    autoDetectResources: true,
    resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]:
            process.env.OTEL_SERVICE_NAME || 'lightdash',
    }),
    resourceDetectors: [gcpDetector, envDetector],
});

// Start the SDK and gracefully shutdown
try {
    sdk.start();
    diag.info('OpenTelemetry SDK started successfully');
} catch (e) {
    diag.error('Error starting OpenTelemetry SDK. No telemetry exporting', e);
}

export const serverTracer = opentelemetry.trace.getTracer(
    'lightdash-server',
    VERSION,
);

export default sdk;
