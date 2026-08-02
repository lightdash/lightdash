/**
 * Tracing runs in one of two exclusive modes, selected by
 * LIGHTDASH_OTEL_TRACES_ENABLED:
 *
 * - OTel mode (Lightdash Cloud): spans are created via the OTel SDK and
 *   exported over OTLP (GCP Cloud Trace). Sentry does NOT receive or create
 *   spans — it is errors-only (see sentry.ts, which strips Sentry's
 *   span-emitting integrations in this mode).
 * - Sentry mode (self-hosted / local Spotlight dev): spans are created via
 *   Sentry's SDK exactly as before OTLP export existed.
 *
 * The modes must not run together: the previous dual export created two spans
 * per traceSpan call and oddly-parented traces.
 */
import type {
    Attributes,
    AttributeValue,
    Context,
    Link,
    Span as OtelSpan,
    SpanKind,
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
import {
    ExpressInstrumentation,
    ExpressLayerType,
} from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import {
    defaultResource,
    resourceFromAttributes,
} from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
    BatchSpanProcessor,
    ParentBasedSampler,
    SamplingDecision,
    TraceIdRatioBasedSampler,
    type Sampler,
    type SamplingResult,
} from '@opentelemetry/sdk-trace-base';
import * as Sentry from '@sentry/node';
import Logger from '../logging/logger';
import { VERSION } from '../version';

type TraceSpanOptions = Parameters<typeof Sentry.startSpan>[0];

/**
 * The span handed to traceSpan callbacks. Both the OTel span and the Sentry
 * span satisfy this surface, so call sites work in either mode.
 */
export type TraceSpan = Pick<
    OtelSpan,
    'setAttribute' | 'setAttributes' | 'setStatus' | 'end' | 'spanContext'
>;

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
    startSpan<T>(
        options: TraceSpanOptions,
        callback: (span: TraceSpan) => T,
    ): T;
};

const serviceVersion = String(VERSION);

const parseBoolean = (value: string | undefined) => value === 'true';

export const otelTracingEnabled = () =>
    parseBoolean(process.env.LIGHTDASH_OTEL_TRACES_ENABLED) &&
    process.env.OTEL_SDK_DISABLED !== 'true' &&
    process.env.OTEL_TRACES_EXPORTER !== 'none';

const getSampleRate = () => {
    const sampleRate = Number(
        // SENTRY_TRACES_SAMPLE_RATE is a deprecated fallback kept while deploy
        // configs migrate; LIGHTDASH_OTEL_TRACES_SAMPLE_RATE is the knob.
        process.env.LIGHTDASH_OTEL_TRACES_SAMPLE_RATE ??
            process.env.SENTRY_TRACES_SAMPLE_RATE ??
            '1',
    );

    if (Number.isNaN(sampleRate)) return 1;
    return Math.min(Math.max(sampleRate, 0), 1);
};

/**
 * AI/agent entrypoints whose traces are always sampled: when a customer
 * reports a broken agent run, the trace must exist regardless of the global
 * sample rate. Cost reporting does not depend on traces (it uses unsampled
 * ai.usage logs), so this is purely a debugging-quality decision.
 *
 * Worker task names mirror SCHEDULER_TASKS / EE_SCHEDULER_TASKS in
 * packages/common/src/types/schedulerTaskList.ts. String literals are used
 * (not imports) so this module stays dependency-free and safe to load before
 * instrumentation patches modules.
 */
const AI_WORKER_TASKS = new Set([
    'slackAiPrompt',
    'aiAgentEvalResult',
    'aiAgentReviewClassifier',
    'aiAgentReviewWriteback',
    'aiAgentReviewRemediationPreview',
    'aiAgentReviewRemediationCompile',
    'aiAgentReviewRemediationRun',
    'embedArtifactVersion',
    'generateArtifactQuestion',
    'appGeneratePipeline',
    'appBuildFromSource',
    'managedAgentHeartbeat',
    'ingestProjectContext',
]);

// Matched against the raw request path: at head-sampling time the HTTP span
// has no resolved http.route yet, only http.target/url.path.
const AI_HTTP_PATHS = [
    /^\/api\/v1\/projects\/[^/]+\/aiAgents(\/|$)/,
    /^\/api\/v1\/projects\/[^/]+\/managed-agent(\/|$)/,
    /^\/api\/v1\/ai\/[^/]+(\/|$)/,
    /^\/api\/v1\/org\/aiRouter(\/|$)/,
    /^\/api\/v1\/aiAgents\/documents(\/|$)/,
    /^\/api\/v1\/ee\/projects\/[^/]+\/(ai-writeback|apps)(\/|$)/,
    /^\/api\/v1\/ee\/user\/apps(\/|$)/,
    /^\/api\/v1\/mcp(\/|$)/,
];

const isAiEntrypoint = (spanName: string, attributes: Attributes): boolean => {
    if (spanName.startsWith('worker.task.')) {
        return AI_WORKER_TASKS.has(spanName.slice('worker.task.'.length));
    }

    const target = attributes['http.target'] ?? attributes['url.path'];
    if (typeof target === 'string') {
        const [path] = target.split('?');
        return AI_HTTP_PATHS.some((pattern) => pattern.test(path));
    }

    return false;
};

/**
 * Head sampler that always samples AI/agent entrypoint roots and delegates
 * everything else. Child spans (including the AI SDK's ai.* spans) follow the
 * root decision via ParentBasedSampler, so sampling the root captures the
 * whole waterfall.
 */
export class AlwaysSampleAiRootsSampler implements Sampler {
    constructor(private readonly delegate: Sampler) {}

    shouldSample(
        samplingContext: Context,
        traceId: string,
        spanName: string,
        spanKind: SpanKind,
        attributes: Attributes,
        links: Link[],
    ): SamplingResult {
        if (isAiEntrypoint(spanName, attributes)) {
            return { decision: SamplingDecision.RECORD_AND_SAMPLED };
        }
        return this.delegate.shouldSample(
            samplingContext,
            traceId,
            spanName,
            spanKind,
            attributes,
            links,
        );
    }

    toString() {
        return `AlwaysSampleAiRoots(${this.delegate.toString()})`;
    }
}

const createTraceSampler = () => {
    const ratioSampler = new TraceIdRatioBasedSampler(getSampleRate());
    const rootSampler =
        process.env.LIGHTDASH_OTEL_ALWAYS_SAMPLE_AI_TRACES === 'false'
            ? ratioSampler
            : new AlwaysSampleAiRootsSampler(ratioSampler);
    return new ParentBasedSampler({
        root: rootSampler,
        // A worker task queued from an unsampled request still gets the
        // AI-aware decision, so agent worker traces are never lost.
        remoteParentNotSampled: rootSampler,
    });
};

// Convert a sentry-trace header ("<traceId>-<spanId>(-<0|1>)?") to W3C
// traceparent so payloads queued by an older Sentry-tracing producer still
// stitch into one trace during a rolling deploy.
export const sentryTraceToTraceparent = (
    sentryTrace: string,
): string | undefined => {
    const match = sentryTrace.match(
        /^([0-9a-f]{32})-([0-9a-f]{16})(?:-([01]))?$/,
    );
    if (!match) return undefined;
    return `00-${match[1]}-${match[2]}-${match[3] === '0' ? '00' : '01'}`;
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
        callback: (span: TraceSpan) => T,
    ): T {
        return this.sentry.startSpan(options, (span) =>
            callback(span as unknown as TraceSpan),
        );
    }
}

// Paths whose incoming requests are not traced at all: health checks and
// high-frequency status polling (mirrors the drop list the Sentry
// tracesSampler used).
const isIgnoredIncomingRequest = (
    url: string,
    userAgent: string | undefined,
): boolean => {
    const [path] = url.split('?');
    return (
        path === '/api/v1/health' ||
        path === '/health' ||
        path.endsWith('/status') ||
        path.endsWith('/favicon.ico') ||
        path.endsWith('/robots.txt') ||
        path.endsWith('livez') ||
        (userAgent ?? '').includes('GoogleHC')
    );
};

class OtelTracingStrategy implements TracingStrategy {
    private readonly isEnabled = otelTracingEnabled;

    private sdk: NodeSDK | undefined;

    private tracer = trace.getTracer('lightdash-backend', serviceVersion);

    initialize() {
        if (!this.isEnabled() || this.sdk) return;

        this.sdk = new NodeSDK({
            // Sentry's context manager (an AsyncLocalStorage manager that also
            // forks Sentry scopes per context) is required for per-request
            // error isolation — Sentry still captures errors in OTel mode.
            contextManager: new Sentry.SentryContextManager(),
            resource: defaultResource().merge(
                resourceFromAttributes({
                    'service.name':
                        process.env.OTEL_SERVICE_NAME || 'lightdash',
                    'service.version': serviceVersion,
                }),
            ),
            sampler: createTraceSampler(),
            metricReaders: [],
            textMapPropagator: new CompositePropagator({
                propagators: [
                    new W3CTraceContextPropagator(),
                    new W3CBaggagePropagator(),
                ],
            }),
            spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
            instrumentations: [
                new HttpInstrumentation({
                    ignoreIncomingRequestHook: (req) =>
                        isIgnoredIncomingRequest(
                            req.url ?? '',
                            req.headers['user-agent'],
                        ),
                }),
                new ExpressInstrumentation({
                    // A span per middleware layer floods traces; the request
                    // handler layer alone still names the HTTP span with the
                    // resolved route.
                    ignoreLayersType: [
                        ExpressLayerType.MIDDLEWARE,
                        ExpressLayerType.ROUTER,
                    ],
                }),
            ],
        });
        this.sdk.start();
        this.tracer = trace.getTracer('lightdash-backend', serviceVersion);

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
            ...(carrier.baggage ? { baggage: carrier.baggage } : {}),
        };
    }

    continueTrace<T>(headers: TraceHeaders, callback: () => T): T {
        const traceparent =
            headers.traceparent ??
            (headers.sentryTrace
                ? sentryTraceToTraceparent(headers.sentryTrace)
                : undefined);

        if (!this.isEnabled() || !traceparent) return callback();

        const carrier: Record<string, string> = {
            traceparent,
            ...(headers.baggage ? { baggage: headers.baggage } : {}),
        };

        return context.with(
            propagation.extract(context.active(), carrier),
            callback,
        );
    }

    startSpan<T>(
        options: TraceSpanOptions,
        callback: (span: TraceSpan) => T,
    ): T {
        if (!this.isEnabled()) {
            // Non-recording span from the un-started tracer keeps the
            // callback contract without emitting anything.
            return callback(this.tracer.startSpan(options.name));
        }

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

    // Exclusive: OTel mode owns spans + propagation entirely, otherwise
    // Sentry does. Running both duplicated every span.
    private get strategy(): TracingStrategy {
        return otelTracingEnabled() ? this.otel : this.sentry;
    }

    initialize() {
        this.sentry.initialize();
        this.otel.initialize();
    }

    async shutdown() {
        await this.otel.shutdown();
        await this.sentry.shutdown();
    }

    getTraceHeaders(): TraceHeaders {
        return this.strategy.getTraceHeaders();
    }

    continueTrace<T>(headers: TraceHeaders, callback: () => T): T {
        return this.strategy.continueTrace(headers, callback);
    }

    startSpan<T>(
        options: TraceSpanOptions,
        callback: (span: TraceSpan) => T,
    ): T {
        return this.strategy.startSpan(options, callback);
    }

    runWithOtelSpanContext<T>(
        options: TraceSpanOptions,
        callback: (span: TraceSpan) => T,
    ): T {
        return this.otel.startSpan(options, callback);
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
    callback: (span: TraceSpan) => T,
): T => tracingService.startSpan(options, callback);

export const getOtelTraceHeaders = getTraceHeaders;

export const continueOtelTrace = continueTrace;

export const runWithOtelSpanContext = <T>(
    options: TraceSpanOptions,
    callback: (span: TraceSpan) => T,
): T => tracingService.runWithOtelSpanContext(options, callback);
