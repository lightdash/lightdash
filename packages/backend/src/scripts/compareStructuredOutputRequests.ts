/**
 * Diagnostic: do `generateObject` and `generateText` + `Output.object` send the
 * same request to the provider?
 *
 * PROD follow-up for AI SDK 7 wants to convert `generateObject` call sites to
 * `generateText` + `Output.object` so they can carry `runtimeContext`
 * attribution, which `generateObject` has no option for. That conversion is
 * only safe if the wire request is unchanged — same endpoint, same schema, same
 * enforcement mode. This intercepts `fetch` and diffs the two.
 *
 * No network access and no API key needed: the fake fetch captures the request
 * and returns a canned response.
 *
 *   pnpm -F backend exec tsx src/scripts/compareStructuredOutputRequests.ts
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, generateText, Output } from 'ai';
import { z } from 'zod';

type Captured = {
    url: string;
    method: string;
    body: unknown;
};

const schema = z.object({
    title: z.string().describe('A short title'),
    score: z.number().describe('Confidence between 0 and 1'),
});

const PROMPT = 'Summarise this conversation.';

/** Captures the outgoing request, then answers with a canned provider reply. */
const makeCapturingFetch = (sink: Captured[], reply: () => unknown) =>
    (async (input: RequestInfo | URL, init?: RequestInit) => {
        let url: string;
        if (typeof input === 'string') {
            url = input;
        } else if (input instanceof URL) {
            url = input.toString();
        } else {
            url = input.url;
        }
        let body: unknown = init?.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch {
                // leave as the raw string
            }
        }
        sink.push({ url, method: init?.method ?? 'POST', body });
        return new Response(JSON.stringify(reply()), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;

const openaiReply = () => ({
    id: 'chatcmpl-diagnostic',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4.1',
    choices: [
        {
            index: 0,
            message: {
                role: 'assistant',
                content: '{"title":"ok","score":0.5}',
            },
            finish_reason: 'stop',
        },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});

const anthropicReply = () => ({
    id: 'msg_diagnostic',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4',
    content: [{ type: 'text', text: '{"title":"ok","score":0.5}' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
});

/** Stable stringify so key order cannot fake a difference. */
const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => [k, canonical(v)]),
        );
    }
    return value;
};

type Provider = 'openai' | 'anthropic' | 'google' | 'azure';

const run = async (label: string, provider: Provider) => {
    const objectCalls: Captured[] = [];
    const textCalls: Captured[] = [];

    const build = (sink: Captured[]) => {
        const fetchImpl = makeCapturingFetch(
            sink,
            provider === 'anthropic' ? anthropicReply : openaiReply,
        );
        switch (provider) {
            case 'openai':
                return createOpenAI({ apiKey: 'd', fetch: fetchImpl })(
                    'gpt-4.1',
                );
            case 'anthropic':
                return createAnthropic({ apiKey: 'd', fetch: fetchImpl })(
                    'claude-haiku-4-5-20251001',
                );
            case 'google':
                return createGoogleGenerativeAI({
                    apiKey: 'd',
                    fetch: fetchImpl,
                })('gemini-2.5-flash');
            case 'azure':
                return createAzure({
                    apiKey: 'd',
                    resourceName: 'diagnostic',
                    fetch: fetchImpl,
                })('gpt-4.1');
            default:
                throw new Error(`unhandled provider: ${String(provider)}`);
        }
    };

    const swallow = async (fn: () => Promise<unknown>) => {
        try {
            await fn();
        } catch (error) {
            // Only the request matters; the canned reply may not fully parse.
            const message =
                error instanceof Error ? error.message : String(error);
            console.log(
                `    (post-request error, ignored: ${message.slice(0, 80)})`,
            );
        }
    };

    // Mirrors a real call site: system + user messages and providerOptions,
    // not a bare prompt.
    const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant.' },
        { role: 'user' as const, content: PROMPT },
        // A thread history ends on the assistant turn. generateThreadTitle
        // passes exactly this shape.
        { role: 'assistant' as const, content: 'Here is the answer.' },
    ];
    const shared = {
        messages,
        allowSystemInMessages: true,
        temperature: 0,
        maxOutputTokens: 256,
    };

    await swallow(() =>
        generateObject({ model: build(objectCalls), schema, ...shared }),
    );
    await swallow(() =>
        generateText({
            model: build(textCalls),
            output: Output.object({ schema }),
            ...shared,
        }),
    );

    console.log(`\n${'='.repeat(72)}\n${label}\n${'='.repeat(72)}`);
    for (const [name, calls] of [
        ['generateObject', objectCalls],
        ['generateText + Output.object', textCalls],
    ] as const) {
        console.log(`\n--- ${name} ---`);
        if (calls.length === 0) console.log('  no request captured');
        calls.forEach((c) => {
            console.log(`  ${c.method} ${c.url}`);
            console.log(
                `  ${JSON.stringify(canonical(c.body), null, 2)
                    .split('\n')
                    .join('\n  ')}`,
            );
        });
    }

    // Two empty captures compare equal, which would be a false pass.
    if (objectCalls.length === 0 || textCalls.length === 0) {
        console.log(
            `\n>>> ${label}: INCONCLUSIVE — captured ${objectCalls.length} vs ${textCalls.length} requests`,
        );
        return false;
    }

    // Full body, not a projection: a lossy view can hide a schema difference.
    const a = JSON.stringify(
        objectCalls.map((c) => [c.url, canonical(c.body)]),
    );
    const b = JSON.stringify(textCalls.map((c) => [c.url, canonical(c.body)]));
    console.log(`\n>>> ${label}: requests ${a === b ? 'IDENTICAL' : 'DIFFER'}`);
    if (a !== b) {
        console.log(`  generateObject: ${a}`);
        console.log(`  generateText  : ${b}`);
    }
    return a === b;
};

const main = async () => {
    const results = [
        await run('OpenAI (responses API)', 'openai'),
        await run('Anthropic (messages)', 'anthropic'),
        await run('Google (generativelanguage)', 'google'),
        await run('Azure OpenAI', 'azure'),
    ];
    console.log(
        `\n${'='.repeat(72)}\nVERDICT: ${
            results.every(Boolean)
                ? 'same wire request on every provider tested'
                : 'the two APIs send DIFFERENT requests — conversion is not behaviour-neutral'
        }\n`,
    );
};

void main();
