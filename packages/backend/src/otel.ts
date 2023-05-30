import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { gcpDetector } from '@opentelemetry/resource-detector-gcp';
import { Resource } from '@opentelemetry/resources';
import { core, NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

// Default to no telemetry
process.env.OTEL_SDK_DISABLED = process.env.OTEL_SDK_DISABLED || 'true';

// Environment variable configuration
// OTEL_TRACES_EXPORTER=otlp
// OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
// OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
// OTEL_RESOURCE_ATTRIBUTES=service.name=lightdash,service.version=1.0.0

if (process.env.OTEL_SDK_DISABLED !== 'true') {
    diag.setLogger(new DiagConsoleLogger(), core.getEnv().OTEL_LOG_LEVEL);
}

const sdk = new NodeSDK({
    // Exporters are auto configured based on environment variables

    // Instrumentations enable tracing/profiling of specific libraries.
    // Auto instrumentation includes http,express,knex,pg,winston
    instrumentations: [
        getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-http': {
                ignoreIncomingRequestHook(req) {
                    // Ignore liveness checks
                    const isLivenessProbe =
                        !!req?.url?.match(/^\/api\/v1\/livez$/);
                    return isLivenessProbe;
                },
            },
        }),
    ],

    // Resource detection automatically sets resource attributes.
    autoDetectResources: true,
    resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'lightdash',
    }),
    resourceDetectors: [gcpDetector],
});

// Start the SDK and gracefully shutdown
try {
    sdk.start();
    diag.info('OpenTelemetry SDK started successfully');
} catch (e) {
    diag.error('Error starting OpenTelemetry SDK. No telemetry exporting', e);
}
process.on('SIGTERM', () => {
    sdk.shutdown()
        .then(() => console.log('OpenTelemetry SDK has been shutdown'))
        .catch((error) =>
            console.log('Error shutting down OpenTelemetry SDK', error),
        );
});
