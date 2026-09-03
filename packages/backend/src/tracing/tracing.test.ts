import {
    context,
    diag,
    ROOT_CONTEXT,
    SpanKind,
    trace,
} from '@opentelemetry/api';
import { SamplingDecision, type Sampler } from '@opentelemetry/sdk-trace-base';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Logger from '../logging/logger';
import {
    AlwaysSampleAiRootsSampler,
    configureOtelTraceExport,
    createOtelInstrumentations,
    getOtelDatabaseTraceMaxQueryLength,
    initOtelTracing,
    installRedactingOtelDiagnostics,
    LightdashTraceContextPropagator,
    otelDatabaseTracingEnabled,
    otelTracingEnabled,
    sanitizeOtelDiagnosticArguments,
    sentryTraceToTraceparent,
    shutdownOtelTracing,
} from './tracing';

const TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPAN_ID = 'bbbbbbbbbbbbbbbb';

afterEach(() => {
    diag.disable();
    vi.restoreAllMocks();
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

describe('otelDatabaseTracingEnabled', () => {
    it('requires both OTel tracing and database tracing to be enabled', () => {
        vi.stubEnv('OTEL_SDK_DISABLED', undefined);
        vi.stubEnv('LIGHTDASH_OTEL_TRACES_ENABLED', 'true');
        vi.stubEnv('LIGHTDASH_OTEL_DB_TRACES_ENABLED', 'true');

        expect(otelDatabaseTracingEnabled()).toBe(true);

        vi.stubEnv('LIGHTDASH_OTEL_DB_TRACES_ENABLED', undefined);
        expect(otelDatabaseTracingEnabled()).toBe(false);

        vi.stubEnv('LIGHTDASH_OTEL_DB_TRACES_ENABLED', 'true');
        vi.stubEnv('LIGHTDASH_OTEL_TRACES_ENABLED', undefined);
        expect(otelDatabaseTracingEnabled()).toBe(false);
    });

    it('stays disabled when the OTel SDK is disabled', () => {
        vi.stubEnv('LIGHTDASH_OTEL_TRACES_ENABLED', 'true');
        vi.stubEnv('LIGHTDASH_OTEL_DB_TRACES_ENABLED', 'true');
        vi.stubEnv('OTEL_SDK_DISABLED', 'true');

        expect(otelDatabaseTracingEnabled()).toBe(false);
    });

    it('adds parent-scoped Knex instrumentation', () => {
        vi.stubEnv('LIGHTDASH_OTEL_TRACES_ENABLED', 'true');
        vi.stubEnv('LIGHTDASH_OTEL_DB_TRACES_ENABLED', 'true');
        vi.stubEnv('LIGHTDASH_OTEL_DB_TRACES_MAX_QUERY_LENGTH', '2048');
        vi.stubEnv('OTEL_SDK_DISABLED', undefined);

        const knexInstrumentation = createOtelInstrumentations().find(
            ({ instrumentationName }) =>
                instrumentationName === '@opentelemetry/instrumentation-knex',
        );

        expect(knexInstrumentation?.getConfig()).toMatchObject({
            requireParentSpan: true,
            maxQueryLength: 2048,
        });
    });

    it.each([
        [undefined, 1022],
        ['2048', 2048],
        ['0', 0],
        ['-1', 1022],
        ['1.5', 1022],
        ['invalid', 1022],
    ])('uses max query length %s as %i', (configured, expected) => {
        vi.stubEnv('LIGHTDASH_OTEL_DB_TRACES_MAX_QUERY_LENGTH', configured);

        expect(getOtelDatabaseTraceMaxQueryLength()).toBe(expected);
    });

    it('omits Knex instrumentation by default', () => {
        vi.stubEnv('LIGHTDASH_OTEL_TRACES_ENABLED', 'true');
        vi.stubEnv('LIGHTDASH_OTEL_DB_TRACES_ENABLED', undefined);
        vi.stubEnv('OTEL_SDK_DISABLED', undefined);

        expect(
            createOtelInstrumentations().some(
                ({ instrumentationName }) =>
                    instrumentationName ===
                    '@opentelemetry/instrumentation-knex',
            ),
        ).toBe(false);
    });
});

describe('configureOtelTraceExport', () => {
    it('reports the default and explicitly disabled exporter selections', () => {
        vi.stubEnv('OTEL_TRACES_EXPORTER', undefined);
        vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_PROTOCOL', undefined);
        vi.stubEnv('OTEL_EXPORTER_OTLP_PROTOCOL', undefined);

        expect(configureOtelTraceExport()).toEqual({
            exporters: ['otlp'],
            protocol: 'http/protobuf',
            warnings: [],
        });

        vi.stubEnv('OTEL_TRACES_EXPORTER', 'none');
        expect(configureOtelTraceExport()).toEqual({
            exporters: ['none'],
            protocol: null,
            warnings: [],
        });
    });

    it('uses none when it is combined with exporters in either order', () => {
        for (const exporters of ['none,otlp', 'otlp,none']) {
            vi.stubEnv('OTEL_TRACES_EXPORTER', exporters);
            expect(configureOtelTraceExport()).toEqual({
                exporters: ['none'],
                protocol: null,
                warnings: [
                    'OTEL_TRACES_EXPORTER contains "none" with other exporters; only "none" will be used',
                ],
            });
            expect(process.env.OTEL_TRACES_EXPORTER).toBe('none');
        }
    });

    it('reports console export without an OTLP protocol', () => {
        vi.stubEnv('OTEL_TRACES_EXPORTER', 'console');
        vi.stubEnv('OTEL_EXPORTER_OTLP_PROTOCOL', 'grpc');

        expect(configureOtelTraceExport()).toEqual({
            exporters: ['console'],
            protocol: null,
            warnings: [],
        });
    });

    it('reports the trace-specific OTLP protocol with precedence', () => {
        vi.stubEnv('OTEL_TRACES_EXPORTER', 'otlp');
        vi.stubEnv('OTEL_EXPORTER_OTLP_PROTOCOL', 'http/protobuf');
        vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_PROTOCOL', 'grpc');

        expect(configureOtelTraceExport()).toEqual({
            exporters: ['otlp'],
            protocol: 'grpc',
            warnings: [],
        });
    });

    it('warns when no supported exporter is selected', () => {
        vi.stubEnv('OTEL_TRACES_EXPORTER', 'unsupported');

        expect(configureOtelTraceExport()).toEqual({
            exporters: [],
            protocol: null,
            warnings: [
                'Unsupported OTEL_TRACES_EXPORTER value "unsupported" was ignored; supported values are otlp, console, zipkin, and none',
                'OpenTelemetry could not configure trace export because no supported exporter was selected',
            ],
        });
    });

    it('warns and reports the OTLP protocol fallback', () => {
        vi.stubEnv('OTEL_TRACES_EXPORTER', 'otlp');
        vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_PROTOCOL', 'unsupported');

        expect(configureOtelTraceExport()).toEqual({
            exporters: ['otlp'],
            protocol: 'http/protobuf',
            warnings: [
                'Unsupported OTLP traces protocol "unsupported"; OpenTelemetry will use "http/protobuf"',
            ],
        });
    });
});

describe('sanitizeOtelDiagnosticArguments', () => {
    it('omits exported span payloads from SDK diagnostics', () => {
        expect(
            sanitizeOtelDiagnosticArguments(
                'OTLPExportDelegate',
                'items to be sent',
                [
                    {
                        attributes: {
                            'url.full': 'https://example.test?token=x',
                        },
                    },
                ],
            ),
        ).toEqual(['OTLPExportDelegate', 'items to be sent (payload omitted)']);
    });

    it('redacts endpoint secrets and structured diagnostic details', () => {
        const sanitized = sanitizeOtelDiagnosticArguments(
            'Request to http://user:password@collector:4318/tenant-secret/v1/traces?token=query failed',
            'authorization=Bearer header-secret',
            'authorization=Basic basic-secret',
            'authorization=AWS4-HMAC-SHA256 Credential=aws-secret, Signature=signature-secret',
            '{"authorization":"Bearer json-secret"}',
            new Error('connect http://collector:4318/path?api_key=secret'),
            { headers: { authorization: 'header-secret' } },
        );
        const output = sanitized.join(' ');

        expect(output).toContain('http://collector:4318/v1/traces');
        expect(output).toContain('[sensitive diagnostic omitted]');
        expect(output).toContain('[diagnostic details omitted]');
        expect(output).not.toMatch(
            /password|query|tenant-secret|header-secret|basic-secret|aws-secret|signature-secret|json-secret|api_key=secret/u,
        );
        expect(
            sanitizeOtelDiagnosticArguments(
                new Error('connect http://user:secret@collector/path?token=x'),
            ),
        ).toEqual(['Error: connect http://collector/']);
    });
});

describe('installRedactingOtelDiagnostics', () => {
    it('honors OTEL_LOG_LEVEL and restores it after NodeSDK construction', () => {
        vi.stubEnv('OTEL_LOG_LEVEL', 'DEBUG');
        const debugSpy = vi
            .spyOn(console, 'debug')
            .mockImplementation(() => {});

        const restoreOtelLogLevel = installRedactingOtelDiagnostics();
        expect(process.env.OTEL_LOG_LEVEL).toBeUndefined();
        debugSpy.mockClear();

        diag.debug('OTLPExportDelegate', 'items to be sent', [
            { authorization: 'Basic secret' },
        ]);
        expect(debugSpy).toHaveBeenCalledWith(
            'OTLPExportDelegate',
            'items to be sent (payload omitted)',
        );

        restoreOtelLogLevel();
        expect(process.env.OTEL_LOG_LEVEL).toBe('DEBUG');
    });

    it('does not enable SDK diagnostics when OTEL_LOG_LEVEL is unset', () => {
        vi.stubEnv('OTEL_LOG_LEVEL', undefined);
        const debugSpy = vi
            .spyOn(console, 'debug')
            .mockImplementation(() => {});

        const restoreOtelLogLevel = installRedactingOtelDiagnostics();
        diag.debug('diagnostic should remain disabled');
        restoreOtelLogLevel();

        expect(debugSpy).not.toHaveBeenCalled();
        expect(process.env.OTEL_LOG_LEVEL).toBeUndefined();
    });
});

describe('initOtelTracing', () => {
    it('logs diagnostic guidance and the effective Lightdash sampling configuration', async () => {
        vi.stubEnv('LIGHTDASH_OTEL_TRACES_ENABLED', 'true');
        vi.stubEnv('OTEL_SDK_DISABLED', undefined);
        vi.stubEnv('OTEL_TRACES_EXPORTER', 'none');
        vi.stubEnv('LIGHTDASH_OTEL_TRACES_SAMPLE_RATE', undefined);
        vi.stubEnv('SENTRY_TRACES_SAMPLE_RATE', undefined);
        vi.stubEnv('OTEL_TRACES_SAMPLER', 'parentbased_traceidratio');
        vi.stubEnv('OTEL_TRACES_SAMPLER_ARG', '0');
        const infoSpy = vi.spyOn(Logger, 'info');

        initOtelTracing();
        await shutdownOtelTracing();

        expect(infoSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'Set OTEL_LOG_LEVEL=DEBUG for OpenTelemetry SDK/exporter diagnostics',
            ),
        );
        expect(infoSpy).toHaveBeenCalledWith(
            expect.stringContaining('Lightdash sampling ratio: 1'),
        );
        expect(infoSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'OTEL_TRACES_SAMPLER and OTEL_TRACES_SAMPLER_ARG are overridden',
            ),
        );
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
