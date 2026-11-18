import { LegacyOpenTelemetry, OpenTelemetry } from '@ai-sdk/otel';
import {
    BasicTracerProvider,
    InMemorySpanExporter,
    SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as Sentry from '@sentry/node';
import { APICallError, generateText, registerTelemetry, RetryError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { inspect } from 'node:util';
import Logger from '../../../../logging/logger';
import { getAiCallTelemetry } from '../utils/aiCallTelemetry';
import { redactModelError, withModelErrorRedaction } from './redactModelError';

vi.mock('@sentry/node', async () => ({
    ...(await vi.importActual<typeof import('@sentry/node')>('@sentry/node')),
    captureException: vi.fn(),
}));

const bytes = Buffer.alloc(2048, 171);
const encoded = bytes.toString('base64');
const imagePrompt: Parameters<MockLanguageModelV4['doGenerate']>[0]['prompt'] =
    [
        {
            role: 'user',
            content: [
                {
                    type: 'file',
                    data: { type: 'data', data: bytes },
                    mediaType: 'image/png',
                },
            ],
        },
    ];
// Mirrors a real provider failure: the image rides only in the request body.
const failure = (isRetryable = false) =>
    new APICallError({
        message: 'Could not process image',
        url: 'https://model.invalid/messages',
        requestBodyValues: {
            messages: [
                {
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/png',
                                data: encoded,
                            },
                        },
                    ],
                },
            ],
            nested: { raw: bytes },
        },
        responseBody: JSON.stringify({
            error: { type: 'invalid_request_error', message: 'Invalid image' },
        }),
        statusCode: isRetryable ? 503 : 400,
        responseHeaders: { 'x-request-id': 'request-123' },
        isRetryable,
        cause: new Error('socket closed'),
        data: { code: 'invalid_image' },
    });
const expectPrivate = (value: unknown) => {
    const serialized = JSON.stringify(value);
    const inspected = inspect(value, { depth: Infinity, showHidden: true });
    expect(serialized).not.toContain(encoded);
    expect(inspected).not.toContain(encoded);
    expect(inspected).not.toContain('ab ab ab ab');
};

let previousTelemetry: typeof globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;
beforeEach(() => {
    previousTelemetry = globalThis.AI_SDK_TELEMETRY_INTEGRATIONS;
});
afterEach(() => {
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = previousTelemetry;
    vi.restoreAllMocks();
    vi.useRealTimers();
});

test('drops the request body and keeps everything used to classify the failure', () => {
    const error = failure();
    const sanitized = redactModelError(error);
    expectPrivate(sanitized);
    expect(APICallError.isInstance(sanitized)).toBe(true);
    expect(sanitized).toMatchObject({
        message: error.message,
        stack: error.stack,
        statusCode: 400,
        isRetryable: false,
        url: error.url,
        responseHeaders: error.responseHeaders,
        responseBody: error.responseBody,
        cause: error.cause,
        data: { code: 'invalid_image' },
    });
});

test('errors that are not provider call errors pass through untouched', () => {
    const plain = new Error('ordinary failure');
    expect(redactModelError(plain)).toBe(plain);
    expect(redactModelError('text')).toBe('text');
});

test('generate and initial stream failures are sanitized before leaving the wrapped model', async () => {
    const model = withModelErrorRedaction(
        new MockLanguageModelV4({
            doGenerate: async () => {
                throw failure();
            },
            doStream: async () => {
                throw failure();
            },
        }),
    );
    const generated = await Promise.resolve(
        model.doGenerate({ prompt: imagePrompt }),
    ).catch((error: unknown) => error);
    const streamed = await Promise.resolve(
        model.doStream({ prompt: imagePrompt }),
    ).catch((error: unknown) => error);
    expectPrivate(generated);
    expectPrivate(streamed);
    expect(APICallError.isInstance(generated)).toBe(true);
    expect(APICallError.isInstance(streamed)).toBe(true);
});

test('text-only calls rethrow provider errors untouched, without walking the request', async () => {
    const error = failure();
    const model = withModelErrorRedaction(
        new MockLanguageModelV4({
            doGenerate: async () => {
                throw error;
            },
        }),
    );
    await expect(
        model.doGenerate({
            prompt: [
                { role: 'user', content: [{ type: 'text', text: 'hello' }] },
            ],
        }),
    ).rejects.toBe(error);
});

test('error chunks and lazy stream rejections are scrubbed as well', async () => {
    const chunkModel = withModelErrorRedaction(
        new MockLanguageModelV4({
            doStream: async () => ({
                stream: new ReadableStream<{ type: 'error'; error: unknown }>({
                    start(controller) {
                        controller.enqueue({ type: 'error', error: failure() });
                        controller.close();
                    },
                }),
            }),
        }),
    );
    const { value } = await (
        await chunkModel.doStream({ prompt: imagePrompt })
    ).stream
        .getReader()
        .read();
    if (value?.type !== 'error') throw new Error('Expected an error chunk');
    expectPrivate(value.error);
    const lazyModel = withModelErrorRedaction(
        new MockLanguageModelV4({
            doStream: async () => ({
                stream: new ReadableStream<never>({
                    start(controller) {
                        controller.error(failure());
                    },
                }),
            }),
        }),
    );
    const lazy = await (
        await lazyModel.doStream({ prompt: imagePrompt })
    ).stream
        .getReader()
        .read()
        .catch((error: unknown) => error);
    expectPrivate(lazy);
    expect(APICallError.isInstance(lazy)).toBe(true);
});

test('every retry error is already sanitized before the SDK aggregates it', async () => {
    vi.useFakeTimers();
    const doGenerate = vi.fn(async () => {
        throw failure(true);
    });
    const model = withModelErrorRedaction(
        new MockLanguageModelV4({ doGenerate }),
    );
    const request = generateText({
        model,
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'file', data: bytes, mediaType: 'image/png' },
                ],
            },
        ],
        maxRetries: 2,
    }).catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    const error = await request;
    expect(doGenerate).toHaveBeenCalledTimes(3);
    expect(RetryError.isInstance(error)).toBe(true);
    expectPrivate(error);
    if (!RetryError.isInstance(error))
        throw new Error('Expected a retry error');
    error.errors.forEach(expectPrivate);
});

test('explicit telemetry defeats the legacy Sentry input override while exported spans/logs retain attribution but no images', async () => {
    const errors: unknown[] = [];
    const log = vi.spyOn(Logger, 'error').mockImplementation(() => Logger);
    vi.mocked(Sentry.captureException).mockClear();
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    const tracer = provider.getTracer('image-privacy-test');
    // SDK hooks receive unfiltered events; the production integrations honor recordInputs.
    // Assert both actual exported span formats, not a raw dump of the SDK's internal events.
    registerTelemetry(
        new LegacyOpenTelemetry({ tracer }),
        new OpenTelemetry({ tracer, runtimeContext: true }),
        {
            onError: (error) => {
                errors.push(error);
                Logger.error('Model failure', error);
                Sentry.captureException(error);
            },
        },
    );
    try {
        const model = withModelErrorRedaction(
            new MockLanguageModelV4({
                doGenerate: async () => {
                    throw failure();
                },
            }),
        );
        await expect(
            generateText({
                model,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'file',
                                data: { type: 'data', data: bytes },
                                mediaType: 'image/png',
                            },
                        ],
                    },
                ],
                maxRetries: 0,
                experimental_telemetry: {
                    isEnabled: true,
                    recordInputs: true,
                    recordOutputs: true,
                },
                ...getAiCallTelemetry({
                    functionId: 'image-chat',
                    feature: 'agent',
                    organizationUuid: 'org-private-test',
                    projectUuid: 'project-test',
                    keyManagement: 'self-managed',
                    recordIO: true,
                    hasBinaryInputs: true,
                }),
            }),
        ).rejects.toBeInstanceOf(APICallError);
        await provider.forceFlush();
        const spans = exporter
            .getFinishedSpans()
            .map(({ name, attributes, events }) => ({
                name,
                attributes,
                events,
            }));
        expect(spans.length).toBeGreaterThan(0);
        expectPrivate(spans);
        expectPrivate(errors);
        expectPrivate(log.mock.calls);
        expectPrivate(vi.mocked(Sentry.captureException).mock.calls);
        expect(log).toHaveBeenCalled();
        expect(Sentry.captureException).toHaveBeenCalled();
        expect(JSON.stringify(spans)).toContain('org-private-test');
        expect(JSON.stringify(spans)).toContain('self-managed');
        for (const { attributes } of spans) {
            expect(attributes).not.toHaveProperty('gen_ai.input.messages');
            expect(attributes).not.toHaveProperty('ai.prompt.messages');
        }
    } finally {
        await provider.shutdown();
    }
});
