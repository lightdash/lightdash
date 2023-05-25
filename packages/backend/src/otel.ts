import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { Resource } from '@opentelemetry/resources';
import {
    ConsoleSpanExporter,
    SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SemanticResourceAttributes as ResourceAttributesSC } from '@opentelemetry/semantic-conventions';

if (process.env.LIGHTDASH_OTEL === 'true') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

    // const exporter = new OTLPTraceExporter({});

    const provider = new NodeTracerProvider({
        resource: new Resource({
            [ResourceAttributesSC.SERVICE_NAME]: 'lightdash',
        }),
        sampler: undefined,
    });

    registerInstrumentations({
        tracerProvider: provider,
        instrumentations: [
            new HttpInstrumentation(),
            new ExpressInstrumentation(),
        ],
    });

    provider.addSpanProcessor(
        new SimpleSpanProcessor(new ConsoleSpanExporter()),
    );
    provider.register();
}
