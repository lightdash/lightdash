import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGoogleVertex } from '@ai-sdk/google-vertex';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, type ModelMessage } from 'ai';
import Logger from '../../../../logging/logger';
import { withModelErrorRedaction } from './redactModelError';
import {
    AiModelRequestTooLargeError,
    createRequestSizeGuardedFetch,
    withImageRequestSizeGuard,
} from './requestSizeGuard';

const imageMessages: ModelMessage[] = [
    {
        role: 'user',
        content: [
            {
                type: 'file',
                data: { type: 'data', data: Buffer.alloc(2048, 171) },
                mediaType: 'image/png',
            },
        ],
    },
];

test('an over-limit image request is rejected before dispatch and carries only byte counts', async () => {
    const base = vi.fn<typeof fetch>();
    const guarded = createRequestSizeGuardedFetch(4, base);
    const error = await withImageRequestSizeGuard(true, () =>
        guarded('https://model.invalid', { method: 'POST', body: '12345' }),
    ).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AiModelRequestTooLargeError);
    expect(error).toMatchObject({ bytes: 5, maxBytes: 4 });
    expect(error).not.toHaveProperty('requestBodyValues');
    expect(base).not.toHaveBeenCalled();
});

test('the exact UTF-8 serialized size is measured, not string length', async () => {
    const guarded = createRequestSizeGuardedFetch(3, vi.fn<typeof fetch>());
    await expect(
        withImageRequestSizeGuard(true, () =>
            guarded('https://model.invalid', { body: '😀' }),
        ),
    ).rejects.toMatchObject({ bytes: 4 });
});

test('under-limit requests forward identical input and options', async () => {
    const response = new Response('ok');
    const base = vi.fn<typeof fetch>().mockResolvedValue(response);
    const guarded = createRequestSizeGuardedFetch(4, base);
    const input = new URL('https://model.invalid');
    const init = {
        method: 'POST',
        body: '1234',
        headers: { 'content-type': 'application/json' },
    };
    await expect(
        withImageRequestSizeGuard(true, () => guarded(input, init)),
    ).resolves.toBe(response);
    expect(base).toHaveBeenCalledWith(input, init);
});

test('large text-only requests remain byte-for-byte unchanged, including outside the scoped middleware', async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
    const guarded = createRequestSizeGuardedFetch(1, base);
    const init = { method: 'POST', body: 'large text-only body' };
    await withImageRequestSizeGuard(false, () =>
        guarded('https://model.invalid', init),
    );
    await guarded('https://model.invalid', init);
    expect(base).toHaveBeenNthCalledWith(1, 'https://model.invalid', init);
    expect(base).toHaveBeenNthCalledWith(2, 'https://model.invalid', init);
});

test('concurrent image and text requests have isolated enforcement scopes', async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
    const guarded = createRequestSizeGuardedFetch(1, base);
    const results = await Promise.allSettled([
        withImageRequestSizeGuard(true, async () => {
            await Promise.resolve();
            return guarded('https://model.invalid/image', { body: '12345' });
        }),
        withImageRequestSizeGuard(false, async () => {
            await Promise.resolve();
            return guarded('https://model.invalid/text', { body: '12345' });
        }),
    ]);
    expect(results[0]?.status).toBe('rejected');
    expect(results[1]?.status).toBe('fulfilled');
    expect(base).toHaveBeenCalledTimes(1);
});

test('bounded binary bodies are measured without consuming streams or form data', async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
    const guarded = createRequestSizeGuardedFetch(1, base);
    await expect(
        withImageRequestSizeGuard(true, () =>
            guarded('https://model.invalid', { body: new Uint8Array([1, 2]) }),
        ),
    ).rejects.toMatchObject({ bytes: 2 });
    await expect(
        withImageRequestSizeGuard(true, () =>
            guarded('https://model.invalid', { body: new Blob(['12']) }),
        ),
    ).rejects.toMatchObject({ bytes: 2 });
    const form = new FormData();
    form.append('text', 'preserved');
    await withImageRequestSizeGuard(false, () =>
        guarded('https://model.invalid', { body: form }),
    );
    expect(base).toHaveBeenCalledWith('https://model.invalid', { body: form });
});

test('the default fetch is resolved at dispatch, not model construction', async () => {
    const before = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('before'));
    const after = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('after'));
    vi.stubGlobal('fetch', before);
    try {
        const guarded = createRequestSizeGuardedFetch(10);
        vi.stubGlobal('fetch', after);
        await guarded('https://model.invalid', { body: 'ok' });
        expect(after).toHaveBeenCalledExactlyOnceWith('https://model.invalid', {
            body: 'ok',
        });
        expect(before).not.toHaveBeenCalled();
    } finally {
        vi.unstubAllGlobals();
    }
});

test('unmeasurable image bodies pass through with one payload-free warning per process', async () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
    const base = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
    const guarded = createRequestSizeGuardedFetch(1, base);
    const form = new FormData();
    form.append('image', 'private-image-value');
    try {
        await withImageRequestSizeGuard(true, () =>
            guarded('https://model.invalid', { body: form }),
        );
        await withImageRequestSizeGuard(true, () =>
            guarded('https://model.invalid', { body: form }),
        );
        expect(warn).toHaveBeenCalledExactlyOnceWith(
            'Could not measure an image model request body; provider request-size limits may apply.',
        );
        expect(base).toHaveBeenCalledTimes(2);
        expect(base).toHaveBeenCalledWith('https://model.invalid', {
            body: form,
        });
    } finally {
        warn.mockRestore();
    }
});

const sdkProviders = [
    {
        name: 'Anthropic',
        create: (fetch: typeof globalThis.fetch) =>
            createAnthropic({ apiKey: 'test-only', fetch })(
                'claude-sonnet-4-5',
            ),
    },
    {
        name: 'Bedrock (signed)',
        create: (fetch: typeof globalThis.fetch) =>
            createAmazonBedrock({
                region: 'us-east-1',
                accessKeyId: 'test-only',
                secretAccessKey: 'test-only',
                fetch,
            })('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
    },
    {
        name: 'OpenAI Responses',
        create: (fetch: typeof globalThis.fetch) =>
            createOpenAI({ apiKey: 'test-only', fetch })('gpt-4o'),
    },
    {
        name: 'OpenAI Chat Completions',
        create: (fetch: typeof globalThis.fetch) =>
            createOpenAI({ apiKey: 'test-only', fetch }).chat('gpt-4o'),
    },
    {
        name: 'Azure Responses',
        create: (fetch: typeof globalThis.fetch) =>
            createAzure({
                apiKey: 'test-only',
                resourceName: 'test-only',
                fetch,
            })('gpt-4o'),
    },
    {
        name: 'Azure Chat Completions',
        create: (fetch: typeof globalThis.fetch) =>
            createAzure({
                apiKey: 'test-only',
                resourceName: 'test-only',
                fetch,
            }).chat('gpt-4o'),
    },
    {
        name: 'Google Interactions',
        create: (fetch: typeof globalThis.fetch) =>
            createGoogleGenerativeAI({
                apiKey: 'test-only',
                fetch,
            }).interactions('gemini-2.5-pro'),
    },
    {
        name: 'Vertex Express',
        create: (fetch: typeof globalThis.fetch) =>
            createGoogleVertex({ apiKey: 'test-only', fetch })(
                'gemini-2.5-pro',
            ),
    },
    {
        name: 'OpenRouter',
        create: (fetch: typeof globalThis.fetch) =>
            createOpenRouter({ apiKey: 'test-only', fetch }).chat(
                'openai/gpt-4o',
            ),
    },
];

test.each(sdkProviders)(
    '$name serializes native images to a final string body and never dispatches/retries an over-limit request',
    async ({ create }) => {
        const base = vi.fn<typeof fetch>();
        const serialized = vi.fn(createRequestSizeGuardedFetch(1, base));
        const model = withModelErrorRedaction(create(serialized));
        await expect(
            generateText({ model, messages: imageMessages, maxRetries: 2 }),
        ).rejects.toBeInstanceOf(AiModelRequestTooLargeError);
        expect(serialized).toHaveBeenCalledOnce();
        expect(typeof serialized.mock.calls[0]?.[1]?.body).toBe('string');
        expect(base).not.toHaveBeenCalled();
    },
);
