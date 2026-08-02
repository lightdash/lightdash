import { context, SpanKind } from '@opentelemetry/api';
import { SamplingDecision, type Sampler } from '@opentelemetry/sdk-trace-base';
import { describe, expect, it, vi } from 'vitest';
import {
    AlwaysSampleAiRootsSampler,
    sentryTraceToTraceparent,
} from './tracing';

const TRACE_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPAN_ID = 'bbbbbbbbbbbbbbbb';

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
