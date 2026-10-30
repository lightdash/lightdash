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
const failure = (isRetryable = false) =>
    new APICallError({
        message: `Provider rejected ${encoded}`,
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
            echoed: encoded,
        }),
        statusCode: isRetryable ? 503 : 400,
        responseHeaders: { 'x-request-id': 'request-123' },
        isRetryable,
        cause: new Error(`Nested ${encoded}`),
        data: {
            code: 'invalid_image',
            original: `data:image/png;base64,${encoded}`,
        },
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

test('large clean provider errors preserve identity across realistic tool/result bodies', () => {
    const error = new APICallError({
        message: 'Provider busy',
        url: 'https://model.invalid',
        statusCode: 503,
        isRetryable: true,
        requestBodyValues: {
            messages: Array.from({ length: 10_000 }, (_, index) => ({
                role: 'tool',
                content: JSON.stringify({ row: index, country: 'example' }),
            })),
        },
    });
    expect(redactModelError(error)).toBe(error);
});

test('bounded traversal has an honest size-limit marker, not a binary-redaction claim', () => {
    let nested: unknown = 'clean';
    for (let index = 0; index < 80; index += 1) nested = { next: nested };
    const error = new APICallError({
        message: 'Provider busy',
        url: 'https://model.invalid',
        requestBodyValues: nested,
    });
    const sanitized = inspect(redactModelError(error), {
        depth: Infinity,
        showHidden: true,
    });
    expect(sanitized).toContain('[omitted: size limit]');
    expect(sanitized).not.toContain('[redacted binary payload]');
});

test('recursively redacts bytes, base64, messages, stacks, causes and bodies while preserving provider classification', () => {
    const error = failure();
    const sanitized = redactModelError(error);
    expectPrivate(sanitized);
    expect(APICallError.isInstance(sanitized)).toBe(true);
    expect(sanitized).toMatchObject({
        statusCode: 400,
        isRetryable: false,
        url: error.url,
        responseHeaders: error.responseHeaders,
        data: { code: 'invalid_image' },
    });
    expect(error.message).toContain(encoded);
});

test('clean text-only errors retain identity and existing metadata', () => {
    const error = new APICallError({
        message: 'quota exceeded',
        url: 'https://model.invalid',
        statusCode: 429,
        requestBodyValues: {
            messages: [{ role: 'user', content: 'text prompt' }],
        },
        data: { code: 'quota' },
    });
    expect(redactModelError(error)).toBe(error);
    const plain = new Error('ordinary failure');
    expect(redactModelError(plain)).toBe(plain);
});

test('short image payloads and JSON-serialized Buffer representations are also scrubbed', () => {
    const image = 'iVBORw0KGgoAAAANSUhEUg==';
    const error = new Error(`Invalid data:image/png;base64,${image}`);
    Object.assign(error, {
        body: JSON.stringify({ type: 'Buffer', data: [137, 80, 78, 71] }),
        bedrock: { image: { format: 'png', source: { bytes: image } } },
    });
    const sanitized = redactModelError(error);
    expect(inspect(sanitized, { depth: Infinity })).not.toContain(image);
    expect(JSON.stringify(sanitized)).not.toContain('[137,80,78,71]');
});

test('cycles, deep objects and serialization hooks cannot retain hidden binary payloads', () => {
    const error = failure();
    Object.assign(error, {
        self: error,
        toJSON: () => encoded,
        [encoded]: 'untrusted property key',
        symbolValue: Symbol(encoded),
        timestamp: Object.assign(new Date(), { image: bytes }),
    });
    Object.defineProperty(error, Symbol.for('nodejs.util.inspect.custom'), {
        value: () => encoded,
    });
    const sanitized = redactModelError(error);
    expectPrivate(sanitized);
    expect(JSON.stringify(sanitized)).toContain('redacted binary payload');
});

test('untrusted accessors fail closed without leaking their thrown payload', () => {
    const value = Object.defineProperty({}, 'type', {
        get() {
            throw new Error(encoded);
        },
    });
    const sanitized = redactModelError({ value });
    expectPrivate(sanitized);
    expect(String(sanitized)).toContain('withheld');
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
        model.doGenerate({ prompt: [] }),
    ).catch((error: unknown) => error);
    const streamed = await Promise.resolve(
        model.doStream({ prompt: [] }),
    ).catch((error: unknown) => error);
    expectPrivate(generated);
    expectPrivate(streamed);
    expect(APICallError.isInstance(generated)).toBe(true);
    expect(APICallError.isInstance(streamed)).toBe(true);
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
        await chunkModel.doStream({ prompt: [] })
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
        await lazyModel.doStream({ prompt: [] })
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
        prompt: 'look at this',
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
