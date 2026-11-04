import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, streamText } from 'ai';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetch as realFetch } from 'undici';
import { z } from 'zod';
import { aiCopilotConfigSchema } from '../../../../config/aiConfigSchema';
import { getAiConfig } from '../../../../config/parseConfig';
import { getAnthropicModel } from './anthropic-claude';
import { getModel } from './index';
import type { ModelPreset } from './presets';

vi.mock('@ai-sdk/anthropic', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@ai-sdk/anthropic')>();
    return { ...actual, createAnthropic: vi.fn(actual.createAnthropic) };
});

const preset: ModelPreset<'anthropic'> = {
    name: 'claude-sonnet-4-6',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    description: '',
    contextWindowTokens: 200_000,
    supportsReasoning: true,
    callOptions: {},
    providerOptions: undefined,
};

describe('getAnthropicModel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('uses x-api-key auth and an explicit public endpoint without a gateway', () => {
        getAnthropicModel(
            {
                apiKey: 'anthropic-key',
                modelName: preset.name,
                availableModels: [],
                customHeaders: {},
                supportsStreaming: true,
                supportsContextManagement: true,
            },
            preset,
        );

        expect(createAnthropic).toHaveBeenCalledWith({
            apiKey: 'anthropic-key',
            baseURL: 'https://api.anthropic.com/v1',
            headers: {},
        });
    });

    test('uses bearer auth and appends one /v1 segment for a gateway', () => {
        getAnthropicModel(
            {
                apiKey: 'gateway-token',
                modelName: preset.name,
                baseUrl: 'https://gateway.example/anthropic/v1/',
                availableModels: [],
                customHeaders: {},
                supportsStreaming: true,
                supportsContextManagement: true,
            },
            preset,
        );

        expect(createAnthropic).toHaveBeenCalledWith({
            authToken: 'gateway-token',
            baseURL: 'https://gateway.example/anthropic/v1',
            headers: {},
        });
    });
});

describe('getAnthropicModel context management', () => {
    const config = {
        apiKey: 'anthropic-key',
        modelName: preset.name,
        availableModels: [],
        customHeaders: {},
        supportsStreaming: true,
        supportsContextManagement: true,
    };

    test('keeps loaded skills, content reads and the recent working set when clearing tool results', () => {
        const model = getAnthropicModel(config, preset);
        const clearToolUses =
            model.providerOptions?.anthropic?.contextManagement?.edits.find(
                (edit) => edit.type === 'clear_tool_uses_20250919',
            );
        expect(clearToolUses).toMatchObject({
            keep: { value: 10 },
            excludeTools: ['loadSkill', 'readContent'],
        });
    });
});

describe('getAnthropicModel reasoning effort', () => {
    const config = {
        apiKey: 'anthropic-key',
        modelName: preset.name,
        availableModels: [],
        customHeaders: {},
        supportsStreaming: true,
        supportsContextManagement: true,
    };

    test('raises the thinking budget and max tokens for budget-style models at xhigh', () => {
        const model = getAnthropicModel(config, preset, {
            enableReasoning: true,
            reasoningEffort: 'xhigh',
        });
        expect(model.providerOptions?.anthropic).toMatchObject({
            thinking: { type: 'enabled', budgetTokens: 16_000 },
        });
        expect(model.callOptions.maxOutputTokens).toBe(24_000);
    });

    test('passes xhigh effort to adaptive models', () => {
        const model = getAnthropicModel(
            config,
            { ...preset, reasoningStyle: 'adaptive' },
            { enableReasoning: true, reasoningEffort: 'xhigh' },
        );
        expect(model.providerOptions?.anthropic).toMatchObject({
            effort: 'xhigh',
            thinking: { type: 'adaptive' },
        });
    });

    test('keeps the medium defaults when no effort is requested', () => {
        const model = getAnthropicModel(config, preset, {
            enableReasoning: true,
        });
        expect(model.providerOptions?.anthropic).toMatchObject({
            thinking: { type: 'enabled', budgetTokens: 2048 },
        });
        expect(model.callOptions.maxOutputTokens).toBeUndefined();
    });
});

describe('Anthropic gateways without context management', () => {
    let server: Server;
    let baseUrl: string;
    let requests: {
        body: Record<string, unknown>;
        status: number;
        beta: string;
    }[];

    beforeEach(async () => {
        requests = [];
        server = createServer(async (request, response) => {
            let body: Record<string, unknown>;
            try {
                let data = '';
                for await (const chunk of request) data += chunk;
                body = z
                    .record(z.string(), z.unknown())
                    .parse(JSON.parse(data));
            } catch {
                response.writeHead(400).end();
                return;
            }
            const status = 'context_management' in body ? 400 : 200;
            requests.push({
                body,
                status,
                beta: String(request.headers['anthropic-beta'] ?? ''),
            });
            if (status === 400) {
                response.writeHead(400, { 'content-type': 'application/json' });
                response.end(
                    JSON.stringify({
                        type: 'error',
                        error: {
                            type: 'invalid_request_error',
                            message:
                                'context_management is not supported by this gateway',
                        },
                    }),
                );
                return;
            }
            const message = {
                id: 'msg_gateway',
                type: 'message',
                role: 'assistant',
                model: body.model,
                content: [
                    { type: 'text', text: 'Gateway completion succeeded' },
                ],
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: { input_tokens: 2, output_tokens: 3 },
            };
            if (body.stream === true) {
                response.writeHead(200, {
                    'content-type': 'text/event-stream',
                });
                const events = [
                    {
                        type: 'message_start',
                        message: { ...message, content: [], stop_reason: null },
                    },
                    {
                        type: 'content_block_start',
                        index: 0,
                        content_block: { type: 'text', text: '' },
                    },
                    {
                        type: 'content_block_delta',
                        index: 0,
                        delta: {
                            type: 'text_delta',
                            text: 'Gateway completion succeeded',
                        },
                    },
                    { type: 'content_block_stop', index: 0 },
                    {
                        type: 'message_delta',
                        delta: { stop_reason: 'end_turn', stop_sequence: null },
                        usage: { output_tokens: 3 },
                    },
                    { type: 'message_stop' },
                ];
                response.end(
                    events
                        .map(
                            (event) =>
                                `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
                        )
                        .join(''),
                );
            } else {
                response.writeHead(200, { 'content-type': 'application/json' });
                response.end(JSON.stringify(message));
            }
        });
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        vi.stubGlobal('fetch', realFetch);
        vi.stubEnv('ANTHROPIC_API_KEY', 'gateway-test-key');
        vi.stubEnv('ANTHROPIC_BASE_URL', baseUrl);
        vi.stubEnv('AI_DEFAULT_PROVIDER', 'anthropic');
        vi.stubEnv('ANTHROPIC_SUPPORTS_CONTEXT_MANAGEMENT', undefined);
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        server.closeAllConnections();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    });

    test.each(
        [
            {
                modelName: 'claude-sonnet-4-6',
                enableReasoning: false,
                thinking: null,
            },
            {
                modelName: 'claude-sonnet-4-6',
                enableReasoning: true,
                thinking: { type: 'enabled', budget_tokens: 2048 },
            },
            {
                modelName: 'claude-opus-4-7',
                enableReasoning: true,
                thinking: { type: 'adaptive' },
            },
        ].flatMap((scenario) =>
            (['generate', 'stream', 'simulated-stream'] as const).map(
                (mode) => ({ ...scenario, mode }),
            ),
        ),
    )(
        'completes $mode requests with $modelName reasoning=$enableReasoning only after opting out',
        async ({ modelName, enableReasoning, thinking, mode }) => {
            vi.stubEnv('ANTHROPIC_MODEL_NAME', modelName);
            vi.stubEnv(
                'ANTHROPIC_SUPPORTS_STREAMING',
                String(mode !== 'simulated-stream'),
            );
            const complete = async () => {
                const options = {
                    ...getModel(aiCopilotConfigSchema.parse(getAiConfig()), {
                        enableReasoning,
                    }),
                    prompt: 'Say hello',
                    maxRetries: 0,
                };
                return mode === 'generate'
                    ? (await generateText(options)).text
                    : streamText({ ...options, onError: vi.fn() }).text;
            };

            await expect(complete()).rejects.toThrow();
            expect(requests[0]).toMatchObject({
                status: 400,
                body: { context_management: { edits: expect.any(Array) } },
            });
            expect(requests[0].beta).toContain('context-management-');

            vi.stubEnv('ANTHROPIC_SUPPORTS_CONTEXT_MANAGEMENT', 'false');
            await expect(complete()).resolves.toBe(
                'Gateway completion succeeded',
            );
            const accepted = requests[requests.length - 1];
            expect(accepted.status).toBe(200);
            expect(accepted.body).not.toHaveProperty('context_management');
            expect(accepted.beta).not.toContain('context-management-');
            expect(accepted.body.stream ?? false).toBe(mode === 'stream');
            if (thinking === null) {
                expect(accepted.body).not.toHaveProperty('thinking');
            } else {
                expect(accepted.body.thinking).toEqual(thinking);
                if (thinking.type === 'adaptive') {
                    expect(accepted.body.output_config).toMatchObject({
                        effort: 'medium',
                    });
                }
            }
        },
    );
});
