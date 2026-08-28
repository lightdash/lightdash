import { context, ROOT_CONTEXT, SpanKind, trace } from '@opentelemetry/api';
import { SamplingDecision, type Sampler } from '@opentelemetry/sdk-trace-base';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    AlwaysSampleAiRootsSampler,
    getOtelTraceExportConfig,
    LightdashTraceContextPropagator,
    otelTracingEnabled,
    sentryTraceToTraceparent,
} from './tracing';

const TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPAN_ID = 'bbbbbbbbbbbbbbbb';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('otelTracingEnabled', () => {
    it('keeps OTel mode enabled when trace export is disabled', () => {
        vi.stubEnv('LIGHTDASH_OTEL_TRACES_ENABLED', 'true');
        vi.stubEnv('OTEL_SDK_DISABLED', undefined);
        vi.stubEnv('OTEL_TRACES_EXPORTER', 'none');

        expect(otelTracingEnabled()).toBe(true);
    });
});

describe('getOtelTraceExportConfig', () => {
    it('reports the default and explicitly disabled exporter selections', () => {
        vi.stubEnv('OTEL_TRACES_EXPORTER', undefined);
        vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_PROTOCOL', undefined);
        vi.stubEnv('OTEL_EXPORTER_OTLP_PROTOCOL', undefined);

        expect(getOtelTraceExportConfig()).toEqual({
            exporters: ['otlp'],
            protocol: 'http/protobuf',
            warnings: [],
        });

        vi.stubEnv('OTEL_TRACES_EXPORTER', 'none');
        expect(getOtelTraceExportConfig()).toEqual({
            exporters: ['none'],
            protocol: null,
            warnings: [],
        });
    });

    it('reports console export without an OTLP protocol', () => {
        vi.stubEnv('OTEL_TRACES_EXPORTER', 'console');
        vi.stubEnv('OTEL_EXPORTER_OTLP_PROTOCOL', 'grpc');

        expect(getOtelTraceExportConfig()).toEqual({
            exporters: ['console'],
            protocol: null,
            warnings: [],
        });
    });

    it('reports the trace-specific OTLP protocol with precedence', () => {
        vi.stubEnv('OTEL_TRACES_EXPORTER', 'otlp');
        vi.stubEnv('OTEL_EXPORTER_OTLP_PROTOCOL', 'http/protobuf');
        vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_PROTOCOL', 'grpc');

        expect(getOtelTraceExportConfig()).toEqual({
            exporters: ['otlp'],
            protocol: 'grpc',
            warnings: [],
        });
    });

    it('warns when no supported exporter is selected', () => {
        vi.stubEnv('OTEL_TRACES_EXPORTER', 'unsupported');

        expect(getOtelTraceExportConfig()).toEqual({
            exporters: [],
            protocol: null,
            warnings: [
                'Unsupported OTEL_TRACES_EXPORTER value "unsupported"; supported values are otlp, console, zipkin, and none',
                'OpenTelemetry could not configure trace export because no supported exporter was selected',
            ],
        });
    });

    it('warns and reports the OTLP protocol fallback', () => {
        vi.stubEnv('OTEL_TRACES_EXPORTER', 'otlp');
        vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_PROTOCOL', 'unsupported');

        expect(getOtelTraceExportConfig()).toEqual({
            exporters: ['otlp'],
            protocol: 'http/protobuf',
            warnings: [
                'Unsupported OTLP traces protocol "unsupported"; OpenTelemetry will use "http/protobuf"',
            ],
        });
    });
});

const makeDelegate = (decision: SamplingDecision): Sampler => ({
    shouldSample: vi.fn().mockReturnValue({ decision }),
    toString: () => 'delegate',
});

const sample = (
    sampler: AlwaysSampleAiRootsSampler,
    spanName: string,
    attributes: Record<string, string> = {},
) =>
    sampler.shouldSample(
        context.active(),
        TRACE_ID,
        spanName,
        SpanKind.SERVER,
        attributes,
        [],
    ).decision;

describe('AlwaysSampleAiRootsSampler', () => {
    it('always samples AI worker task roots', () => {
        const delegate = makeDelegate(SamplingDecision.NOT_RECORD);
        const sampler = new AlwaysSampleAiRootsSampler(delegate);

        expect(sample(sampler, 'worker.task.slackAiPrompt')).toBe(
            SamplingDecision.RECORD_AND_SAMPLED,
        );
        expect(sample(sampler, 'worker.task.aiAgentReviewRemediationRun')).toBe(
            SamplingDecision.RECORD_AND_SAMPLED,
        );
        expect(sample(sampler, 'worker.task.appGeneratePipeline')).toBe(
            SamplingDecision.RECORD_AND_SAMPLED,
        );
        expect(delegate.shouldSample).not.toHaveBeenCalled();
    });

    it('delegates non-AI worker tasks', () => {
        const delegate = makeDelegate(SamplingDecision.NOT_RECORD);
        const sampler = new AlwaysSampleAiRootsSampler(delegate);

        expect(sample(sampler, 'worker.task.handleScheduledDelivery')).toBe(
            SamplingDecision.NOT_RECORD,
        );
        expect(delegate.shouldSample).toHaveBeenCalledTimes(1);
    });

    it('always samples AI HTTP roots by raw request path', () => {
        const delegate = makeDelegate(SamplingDecision.NOT_RECORD);
        const sampler = new AlwaysSampleAiRootsSampler(delegate);

        expect(
            sample(sampler, 'POST', {
                'http.target':
                    '/api/v1/projects/1234/aiAgents/5678/threads?foo=1',
            }),
        ).toBe(SamplingDecision.RECORD_AND_SAMPLED);
        expect(
            sample(sampler, 'POST', {
                'http.target': '/api/v1/ai/1234/chart/generate-metadata',
            }),
        ).toBe(SamplingDecision.RECORD_AND_SAMPLED);
        expect(
            sample(sampler, 'POST', {
                'url.path': '/api/v1/org/aiRouter/route',
            }),
        ).toBe(SamplingDecision.RECORD_AND_SAMPLED);
        expect(sample(sampler, 'POST', { 'http.target': '/api/v1/mcp' })).toBe(
            SamplingDecision.RECORD_AND_SAMPLED,
        );
    });

    it('delegates non-AI HTTP roots, including lookalike paths', () => {
        const delegate = makeDelegate(SamplingDecision.RECORD_AND_SAMPLED);
        const sampler = new AlwaysSampleAiRootsSampler(delegate);

        expect(
            sample(sampler, 'GET', {
                'http.target': '/api/v1/projects/1234/spaces',
            }),
        ).toBe(SamplingDecision.RECORD_AND_SAMPLED);
        expect(delegate.shouldSample).toHaveBeenCalledTimes(1);

        // 'aiAgentsFoo' must not match the aiAgents prefix
        expect(
            sample(sampler, 'GET', {
                'http.target': '/api/v1/projects/1234/aiAgentsFoo',
            }),
        ).toBe(SamplingDecision.RECORD_AND_SAMPLED);
        expect(delegate.shouldSample).toHaveBeenCalledTimes(2);
    });

    it('delegates spans with no recognizable entrypoint attributes', () => {
        const delegate = makeDelegate(SamplingDecision.NOT_RECORD);
        const sampler = new AlwaysSampleAiRootsSampler(delegate);

        expect(sample(sampler, 'queue_consumer')).toBe(
            SamplingDecision.NOT_RECORD,
        );
        expect(delegate.shouldSample).toHaveBeenCalledTimes(1);
    });
});

describe('sentryTraceToTraceparent', () => {
    it('converts a sampled sentry-trace header', () => {
        expect(sentryTraceToTraceparent(`${TRACE_ID}-${SPAN_ID}-1`)).toBe(
            `00-${TRACE_ID}-${SPAN_ID}-01`,
        );
    });

    it('converts an unsampled sentry-trace header', () => {
        expect(sentryTraceToTraceparent(`${TRACE_ID}-${SPAN_ID}-0`)).toBe(
            `00-${TRACE_ID}-${SPAN_ID}-00`,
        );
    });

    it('treats a missing sampled flag as sampled', () => {
        expect(sentryTraceToTraceparent(`${TRACE_ID}-${SPAN_ID}`)).toBe(
            `00-${TRACE_ID}-${SPAN_ID}-01`,
        );
    });

    it('returns undefined for malformed input', () => {
        expect(sentryTraceToTraceparent('not-a-trace')).toBeUndefined();
        expect(sentryTraceToTraceparent('')).toBeUndefined();
        expect(
            sentryTraceToTraceparent(`${TRACE_ID}-${SPAN_ID}-2`),
        ).toBeUndefined();
    });
});

describe('LightdashTraceContextPropagator', () => {
    const getter = {
        keys: (carrier: Record<string, string>) => Object.keys(carrier),
        get: (carrier: Record<string, string>, key: string) => carrier[key],
    };

    it('does not adopt a Sentry browser span as the OTel parent', () => {
        const sentryTrace = `${TRACE_ID}-${SPAN_ID}-1`;
        const propagator = new LightdashTraceContextPropagator();
        const extracted = propagator.extract(
            ROOT_CONTEXT,
            {
                'sentry-trace': sentryTrace,
                traceparent: sentryTraceToTraceparent(sentryTrace)!,
            },
            getter,
        );

        expect(trace.getSpanContext(extracted)).toBeUndefined();
    });

    it('continues genuine W3C trace context', () => {
        const traceparent = `00-${TRACE_ID}-${SPAN_ID}-01`;
        const propagator = new LightdashTraceContextPropagator();
        const extracted = propagator.extract(
            ROOT_CONTEXT,
            { traceparent },
            getter,
        );

        expect(trace.getSpanContext(extracted)).toMatchObject({
            traceId: TRACE_ID,
            spanId: SPAN_ID,
            isRemote: true,
        });
    });
});
