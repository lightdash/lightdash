import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { gcpDetector } from '@opentelemetry/resource-detector-gcp';
import { Resource } from '@opentelemetry/resources';
import {
    ConsoleMetricExporter,
    PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

if (['console', 'otlp'].includes(process.env.LIGHTDASH_OTEL || '')) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

    const sdk = new NodeSDK({
        // Exporters configure where and how data is exported.
        traceExporter:
            process.env.LIGHTDASH_OTEL === 'console'
                ? new ConsoleSpanExporter()
                : new OTLPTraceExporter(),
        metricReader: new PeriodicExportingMetricReader({
            exporter:
                process.env.LIGHTDASH_OTEL === 'console'
                    ? new ConsoleMetricExporter()
                    : new OTLPMetricExporter(),
        }),

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
    sdk.start();
    process.on('SIGTERM', () => {
        sdk.shutdown()
            .then(() => console.log('OpenTelemetry SDK has been shutdown'))
            .catch((error) =>
                console.log('Error shutting down OpenTelemetry SDK', error),
            )
            .finally(() => process.exit(0));
    });
}
