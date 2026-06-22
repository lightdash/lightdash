import type {
    Attributes,
    AttributeValue,
    Span as OtelSpan,
} from '@opentelemetry/api';
import {
    context,
    propagation,
    SpanStatusCode,
    trace,
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import {
    defaultResource,
    resourceFromAttributes,
} from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
    BatchSpanProcessor,
    ParentBasedSampler,
    TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import * as Sentry from '@sentry/node';
import {
    SentryPropagator,
    SentrySampler,
    SentrySpanProcessor,
} from '@sentry/opentelemetry';
import Logger from '../logging/logger';
import { VERSION } from '../version';

type TraceSpanOptions = Parameters<typeof Sentry.startSpan>[0];

type OtelTraceHeaders = {
    traceparent?: string;
    sentryTrace?: string;
    baggage?: string;
};

let sdk: NodeSDK | undefined;
const serviceVersion = String(VERSION);
let tracer = trace.getTracer('lightdash-backend', serviceVersion);

const parseBoolean = (value: string | undefined) => value === 'true';

export const otelTracingEnabled = () =>
    parseBoolean(process.env.LIGHTDASH_OTEL_TRACES_ENABLED) &&
    process.env.OTEL_SDK_DISABLED !== 'true' &&
    process.env.OTEL_TRACES_EXPORTER !== 'none';

const getSampleRate = () => {
    const sampleRate = Number(
        process.env.LIGHTDASH_OTEL_TRACES_SAMPLE_RATE ??
            process.env.SENTRY_TRACES_SAMPLE_RATE ??
            '1',
    );

    if (Number.isNaN(sampleRate)) return 1;
    return Math.min(Math.max(sampleRate, 0), 1);
};

const createTraceSampler = () => {
    const sampler = new TraceIdRatioBasedSampler(getSampleRate());
    return new ParentBasedSampler({
        root: sampler,
        remoteParentNotSampled: sampler,
    });
};

const toOtelAttributes = (
    attributes: TraceSpanOptions['attributes'],
): Attributes => {
    const entries = Object.entries(attributes ?? {}).filter(
        (entry): entry is [string, AttributeValue] => {
            const value = entry[1];
            return (
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean' ||
                (Array.isArray(value) &&
                    value.every(
                        (item) =>
                            typeof item === 'string' ||
                            typeof item === 'number' ||
                            typeof item === 'boolean',
                    ))
            );
        },
    );

    return Object.fromEntries(entries);
};

export const initOtelTracing = () => {
    if (!otelTracingEnabled() || sdk) return;

    const sentryClient = Sentry.getClient();

    sdk = new NodeSDK({
        contextManager: new Sentry.SentryContextManager(),
        resource: defaultResource().merge(
            resourceFromAttributes({
                'service.name': process.env.OTEL_SERVICE_NAME || 'lightdash',
                'service.version': serviceVersion,
            }),
        ),
        sampler: sentryClient
            ? new SentrySampler(sentryClient)
            : createTraceSampler(),
        textMapPropagator: new SentryPropagator(),
        spanProcessors: [
            new SentrySpanProcessor(),
            new BatchSpanProcessor(new OTLPTraceExporter()),
        ],
        instrumentations: [
            new HttpInstrumentation({
                ignoreIncomingRequestHook: (req) =>
                    req.url === '/api/v1/health' || req.url === '/health',
            }),
            new ExpressInstrumentation(),
        ],
    });
    sdk.start();
    tracer = trace.getTracer('lightdash-backend', serviceVersion);
    Sentry.validateOpenTelemetrySetup();

    Logger.info('OTEL trace export enabled');
};

export const shutdownOtelTracing = async () => {
    await sdk?.shutdown();
};

export const getOtelTraceHeaders = (): OtelTraceHeaders => {
    if (!otelTracingEnabled()) return {};

    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);

    return {
        traceparent: carrier.traceparent ?? carrier['sentry-trace'],
        sentryTrace: carrier['sentry-trace'],
        baggage: carrier.baggage,
    };
};

export const continueOtelTrace = <T>(
    headers: OtelTraceHeaders,
    callback: () => T,
): T => {
    const traceHeader = headers.sentryTrace ?? headers.traceparent;
    if (!otelTracingEnabled() || !traceHeader) return callback();

    const carrier: Record<string, string> = {
        traceparent: headers.traceparent ?? traceHeader,
        'sentry-trace': headers.sentryTrace ?? traceHeader,
        ...(headers.baggage ? { baggage: headers.baggage } : {}),
    };

    return context.with(
        propagation.extract(context.active(), carrier),
        callback,
    );
};

const runWithOtelSpan = <T>(
    options: TraceSpanOptions,
    callback: (span?: OtelSpan) => T,
): T => {
    if (!otelTracingEnabled()) return callback();

    const span = tracer.startSpan(
        options.name,
        {
            attributes: {
                ...toOtelAttributes(options.attributes),
                ...(options.op ? { 'sentry.op': options.op } : {}),
            },
        },
        context.active(),
    );

    const finishWithError = (error: unknown): never => {
        span.recordException(error as Error);
        span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
        });
        span.end();
        throw error;
    };

    return context.with(trace.setSpan(context.active(), span), () => {
        try {
            const result = callback(span);
            const maybePromise = result as unknown as Promise<unknown>;
            if (result && typeof maybePromise.then === 'function') {
                return maybePromise.then(
                    (value) => {
                        span.end();
                        return value;
                    },
                    (error) => finishWithError(error),
                ) as T;
            }

            span.end();
            return result;
        } catch (error) {
            return finishWithError(error);
        }
    });
};

export const traceSpan = <T>(
    options: TraceSpanOptions,
    callback: (span: Sentry.Span) => T,
): T => runWithOtelSpan(options, () => Sentry.startSpan(options, callback));

export const runWithOtelSpanContext = <T>(
    options: TraceSpanOptions,
    callback: (span?: OtelSpan) => T,
): T => {
    if (!otelTracingEnabled()) return callback();

    const span = tracer.startSpan(
        options.name,
        {
            attributes: {
                ...toOtelAttributes(options.attributes),
                ...(options.op ? { 'sentry.op': options.op } : {}),
            },
        },
        context.active(),
    );

    return context.with(trace.setSpan(context.active(), span), () =>
        callback(span),
    );
};

export const recordOtelSpanError = (span: OtelSpan, error: unknown) => {
    span.recordException(error as Error);
    span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
    });
};
