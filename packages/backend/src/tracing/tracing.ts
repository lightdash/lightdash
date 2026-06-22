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
import {
    CompositePropagator,
    W3CBaggagePropagator,
    W3CTraceContextPropagator,
} from '@opentelemetry/core';
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
import { SentryPropagator, SentrySpanProcessor } from '@sentry/opentelemetry';
import Logger from '../logging/logger';
import { VERSION } from '../version';

type TraceSpanOptions = Parameters<typeof Sentry.startSpan>[0];

export type TraceHeaders = {
    traceparent?: string;
    sentryTrace?: string;
    baggage?: string;
};

type TracingStrategy = {
    initialize(): void;
    shutdown(): Promise<void>;
    getTraceHeaders(): TraceHeaders;
    continueTrace<T>(headers: TraceHeaders, callback: () => T): T;
};

const serviceVersion = String(VERSION);

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

export const recordOtelSpanError = (span: OtelSpan, error: unknown) => {
    span.recordException(error as Error);
    span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
    });
};

class SentryTracingStrategy implements TracingStrategy {
    private readonly sentry = Sentry;

    initialize() {
        this.sentry.getClient();
    }

    shutdown() {
        this.sentry.getClient();
        return Promise.resolve();
    }

    getTraceHeaders(): TraceHeaders {
        const span = this.sentry.getActiveSpan();
        if (!span) return {};

        const baggage = this.sentry.spanToBaggageHeader(span);
        return {
            sentryTrace: this.sentry.spanToTraceHeader(span),
            ...(baggage ? { baggage } : {}),
        };
    }

    continueTrace<T>(headers: TraceHeaders, callback: () => T): T {
        const { sentryTrace } = headers;
        if (!sentryTrace) return callback();

        return this.sentry.continueTrace(
            { sentryTrace, baggage: headers.baggage },
            callback,
        );
    }

    startSpan<T>(
        options: TraceSpanOptions,
        callback: (span: Sentry.Span) => T,
    ): T {
        return this.sentry.startSpan(options, callback);
    }
}

class OtelTracingStrategy implements TracingStrategy {
    private readonly isEnabled = otelTracingEnabled;

    private sdk: NodeSDK | undefined;

    private tracer = trace.getTracer('lightdash-backend', serviceVersion);

    initialize() {
        if (!this.isEnabled() || this.sdk) return;

        this.sdk = new NodeSDK({
            contextManager: new Sentry.SentryContextManager(),
            resource: defaultResource().merge(
                resourceFromAttributes({
                    'service.name':
                        process.env.OTEL_SERVICE_NAME || 'lightdash',
                    'service.version': serviceVersion,
                }),
            ),
            sampler: createTraceSampler(),
            textMapPropagator: new CompositePropagator({
                propagators: [
                    new W3CTraceContextPropagator(),
                    new W3CBaggagePropagator(),
                    new SentryPropagator(),
                ],
            }),
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
        this.sdk.start();
        this.tracer = trace.getTracer('lightdash-backend', serviceVersion);
        Sentry.validateOpenTelemetrySetup();

        Logger.info('OTEL trace export enabled');
    }

    async shutdown() {
        await this.sdk?.shutdown();
    }

    getTraceHeaders(): TraceHeaders {
        if (!this.isEnabled()) return {};

        const carrier: Record<string, string> = {};
        propagation.inject(context.active(), carrier);

        return {
            ...(carrier.traceparent
                ? { traceparent: carrier.traceparent }
                : {}),
            ...(carrier['sentry-trace']
                ? { sentryTrace: carrier['sentry-trace'] }
                : {}),
            ...(carrier.baggage ? { baggage: carrier.baggage } : {}),
        };
    }

    continueTrace<T>(headers: TraceHeaders, callback: () => T): T {
        if (!this.isEnabled() || (!headers.traceparent && !headers.sentryTrace))
            return callback();

        const carrier: Record<string, string> = {
            ...(headers.traceparent
                ? { traceparent: headers.traceparent }
                : {}),
            ...(headers.sentryTrace
                ? { 'sentry-trace': headers.sentryTrace }
                : {}),
            ...(headers.baggage ? { baggage: headers.baggage } : {}),
        };

        return context.with(
            propagation.extract(context.active(), carrier),
            callback,
        );
    }

    runWithSpan<T>(
        options: TraceSpanOptions,
        callback: (span?: OtelSpan) => T,
    ): T {
        if (!this.isEnabled()) return callback();

        const span = this.tracer.startSpan(
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
            recordOtelSpanError(span, error);
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
    }
}

class TracingService {
    constructor(
        private readonly sentry: SentryTracingStrategy,
        private readonly otel: OtelTracingStrategy,
    ) {}

    initialize() {
        this.sentry.initialize();
        this.otel.initialize();
    }

    async shutdown() {
        await this.otel.shutdown();
        await this.sentry.shutdown();
    }

    getTraceHeaders(): TraceHeaders {
        return {
            ...this.sentry.getTraceHeaders(),
            ...this.otel.getTraceHeaders(),
        };
    }

    continueTrace<T>(headers: TraceHeaders, callback: () => T): T {
        return this.sentry.continueTrace(headers, () =>
            this.otel.continueTrace(headers, callback),
        );
    }

    startSpan<T>(
        options: TraceSpanOptions,
        callback: (span: Sentry.Span) => T,
    ): T {
        return this.otel.runWithSpan(options, () =>
            this.sentry.startSpan(options, callback),
        );
    }

    runWithOtelSpanContext<T>(
        options: TraceSpanOptions,
        callback: (span?: OtelSpan) => T,
    ): T {
        return this.otel.runWithSpan(options, callback);
    }
}

const tracingService = new TracingService(
    new SentryTracingStrategy(),
    new OtelTracingStrategy(),
);

export const initOtelTracing = () => tracingService.initialize();

export const shutdownOtelTracing = async () => tracingService.shutdown();

export const getTraceHeaders = () => tracingService.getTraceHeaders();

export const continueTrace = <T>(headers: TraceHeaders, callback: () => T): T =>
    tracingService.continueTrace(headers, callback);

export const traceSpan = <T>(
    options: TraceSpanOptions,
    callback: (span: Sentry.Span) => T,
): T => tracingService.startSpan(options, callback);

export const getOtelTraceHeaders = getTraceHeaders;

export const continueOtelTrace = continueTrace;

export const runWithOtelSpanContext = <T>(
    options: TraceSpanOptions,
    callback: (span?: OtelSpan) => T,
): T => tracingService.runWithOtelSpanContext(options, callback);
