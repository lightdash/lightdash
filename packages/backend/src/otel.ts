import {
    Attributes,
    diag,
    DiagConsoleLogger,
    DiagLogLevel,
    SpanKind,
    trace,
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { Resource } from '@opentelemetry/resources';
import {
    AlwaysOnSampler,
    Sampler,
    SamplingDecision,
    SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
    SemanticAttributes,
    SemanticResourceAttributes as ResourceAttributesSC,
} from '@opentelemetry/semantic-conventions';

type FilterFunction = (
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
) => boolean;

function filterSampler(filterFn: FilterFunction, parent: Sampler): Sampler {
    return {
        shouldSample(ctx, tid, spanName, spanKind, attr, links) {
            if (!filterFn(spanName, spanKind, attr)) {
                return { decision: SamplingDecision.NOT_RECORD };
            }
            return parent.shouldSample(
                ctx,
                tid,
                spanName,
                spanKind,
                attr,
                links,
            );
        },
        toString() {
            return `FilterSampler(${parent.toString()})`;
        },
    };
}

function ignoreHealthCheck(
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
) {
    return (
        spanKind !== SpanKind.SERVER ||
        attributes[SemanticAttributes.HTTP_ROUTE] !== '/api/v1/health'
    );
}

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const exporter = new OTLPTraceExporter({});

interface OTelConfig {
    ignoreHealthChecks: boolean;
}

export const setupTracing = (serviceName: string, config: OTelConfig) => {
    const provider = new NodeTracerProvider({
        resource: new Resource({
            [ResourceAttributesSC.SERVICE_NAME]: serviceName,
        }),
        sampler: config.ignoreHealthChecks
            ? undefined
            : filterSampler(ignoreHealthCheck, new AlwaysOnSampler()),
    });

    registerInstrumentations({
        tracerProvider: provider,
        instrumentations: [
            new HttpInstrumentation(),
            new ExpressInstrumentation(),
        ],
    });

    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();

    return trace.getTracer(serviceName);
};
