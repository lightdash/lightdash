import { createVertex } from '@ai-sdk/google-vertex';
import { isByoAiProvider } from '@lightdash/common';
import { generateText, jsonSchema, stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import { aiCopilotConfigSchema } from '../../../../config/aiConfigSchema';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import { getAiConfig } from '../../../../config/parseConfig';
import { getLanguageModelAttribution } from '../utils/aiCallTelemetry';
import {
    getAvailableModels,
    getCompactionModelMetadata,
    getDefaultModel,
    getFastModelForAccessibleKey,
    getModel,
    presetToModelOption,
} from './index';

vi.mock('@ai-sdk/google-vertex', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('@ai-sdk/google-vertex')>();
    return { ...actual, createVertex: vi.fn(actual.createVertex) };
});

const config = aiCopilotConfigSchema.parse({
    ...lightdashConfigMock.ai.copilot,
    defaultProvider: 'vertex',
    providers: {
        vertex: {
            auth: { type: 'api-key', apiKey: 'test-vertex-key' },
            modelName: 'gemini-3.8-flash',
        },
    },
});

const completion = {
    candidates: [
        {
            content: { role: 'model', parts: [{ text: 'Hello' }] },
            finishReason: 'STOP',
        },
    ],
    usageMetadata: {
        promptTokenCount: 3,
        candidatesTokenCount: 1,
        totalTokenCount: 4,
    },
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

describe('Vertex instance configuration', () => {
    beforeEach(() => {
        for (const name of [
            'GOOGLE_VERTEX_API_KEY',
            'GOOGLE_VERTEX_PROJECT',
            'GOOGLE_VERTEX_LOCATION',
            'GOOGLE_VERTEX_MODEL_NAME',
            'GOOGLE_VERTEX_FAST_MODEL_NAME',
            'GOOGLE_VERTEX_SUPPORTS_STREAMING',
        ]) {
            vi.stubEnv(name, undefined);
        }
    });

    it('does not enable Vertex just because ADC exists on the machine', () => {
        vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS', '/test/credentials.json');
        expect(getAiConfig().providers.vertex).toBeUndefined();
    });

    it('configures ADC with the project and defaults to the global endpoint', () => {
        vi.stubEnv('AI_DEFAULT_PROVIDER', 'vertex');
        vi.stubEnv('GOOGLE_VERTEX_PROJECT', 'test-project');
        vi.stubEnv('GOOGLE_VERTEX_MODEL_NAME', 'custom-model');
        vi.stubEnv('GOOGLE_VERTEX_FAST_MODEL_NAME', 'fast-model');
        vi.stubEnv('GOOGLE_VERTEX_SUPPORTS_STREAMING', 'false');
        const parsed = aiCopilotConfigSchema.parse(getAiConfig());
        expect(parsed.providers.vertex).toEqual({
            auth: { type: 'adc', project: 'test-project', location: 'global' },
            modelName: 'custom-model',
            fastModelName: 'fast-model',
            supportsStreaming: false,
        });
    });

    it('uses an explicit region and ignores an empty API key', () => {
        vi.stubEnv('GOOGLE_VERTEX_API_KEY', '');
        vi.stubEnv('GOOGLE_VERTEX_PROJECT', 'test-project');
        vi.stubEnv('GOOGLE_VERTEX_LOCATION', 'europe-west1');
        expect(getAiConfig().providers.vertex?.auth).toEqual({
            type: 'adc',
            project: 'test-project',
            location: 'europe-west1',
        });
    });

    it('uses Express Mode when an API key is configured, even with a project', () => {
        vi.stubEnv('GOOGLE_VERTEX_API_KEY', 'test-key');
        vi.stubEnv('GOOGLE_VERTEX_PROJECT', 'test-project');
        expect(getAiConfig().providers.vertex?.auth).toEqual({
            type: 'api-key',
            apiKey: 'test-key',
        });
    });

    it('requires a configured provider when Vertex is the enabled default', () => {
        vi.stubEnv('AI_COPILOT_ENABLED', 'true');
        vi.stubEnv('AI_DEFAULT_PROVIDER', 'vertex');
        expect(aiCopilotConfigSchema.safeParse(getAiConfig()).success).toBe(
            false,
        );
    });
});

describe('Vertex model routing', () => {
    it('lists the configured model while keeping credentials instance-managed', () => {
        const result = getModel(config, { modelName: 'untrusted-model' });
        expect(result.model.modelId).toBe('gemini-3.8-flash');
        expect(getDefaultModel(config)).toEqual({
            name: 'gemini-3.8-flash',
            provider: 'vertex',
        });
        expect(getAvailableModels(config)).toEqual([
            expect.objectContaining({
                provider: 'vertex',
                modelId: 'gemini-3.8-flash',
                displayName: 'Gemini 3.8 Flash (Vertex AI)',
                groupLabel: 'Google Vertex AI',
                supportsReasoning: false,
            }),
        ]);
        expect(isByoAiProvider('vertex')).toBe(false);
        expect(getCompactionModelMetadata(config)).toEqual({
            supportsCompaction: false,
            contextWindowTokens: null,
        });
        expect(result.keyManagement).toBe('self-managed');
        expect(getLanguageModelAttribution(result.model)).toEqual({
            model: 'gemini-3.8-flash',
            provider: 'vertex',
        });
    });

    it('adds Vertex alongside existing providers without changing the default', () => {
        const mixed = aiCopilotConfigSchema.parse({
            ...config,
            defaultProvider: 'openai',
            providers: {
                ...config.providers,
                openai: { apiKey: 'test-openai-key', modelName: 'gpt-5.6-sol' },
                google: {
                    apiKey: 'test-google-key',
                    modelName: 'gemini-3.8-flash',
                },
            },
        });
        const defaultModel = getDefaultModel(mixed);
        const models = getAvailableModels(mixed);
        const options = models.map((preset) =>
            presetToModelOption(preset, defaultModel),
        );
        expect(defaultModel).toEqual({
            provider: 'openai',
            name: 'gpt-5.6-sol',
        });
        expect(options.filter((option) => option.default)).toEqual([
            expect.objectContaining({
                provider: 'openai',
                name: 'gpt-5.6-sol',
            }),
        ]);
        expect(options).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    provider: 'google',
                    modelId: 'gemini-3.8-flash',
                }),
                expect.objectContaining({
                    provider: 'vertex',
                    modelId: 'gemini-3.8-flash',
                    default: false,
                }),
            ]),
        );
        expect(
            getModel(mixed, {
                provider: 'vertex',
                modelName: 'gemini-3.8-flash',
            }).model.provider,
        ).toBe('vertex');
        expect(getModel(mixed).model.provider).toContain('openai');

        const vertexDefault = {
            ...mixed,
            defaultProvider: config.defaultProvider,
        };
        expect(getAvailableModels(vertexDefault)).toEqual(models);
        expect(isByoAiProvider('vertex')).toBe(false);
    });

    it('does not list Vertex when the instance has no Vertex configuration', () => {
        const withoutVertex = aiCopilotConfigSchema.parse({
            ...config,
            defaultProvider: 'openai',
            providers: { openai: { apiKey: 'test-key' } },
        });
        expect(
            getAvailableModels(withoutVertex).some(
                (preset) => preset.provider === 'vertex',
            ),
        ).toBe(false);
    });

    it('supports arbitrary instance model IDs and server-pinned snapshots', () => {
        const custom = aiCopilotConfigSchema.parse({
            ...config,
            providers: {
                vertex: {
                    ...config.providers.vertex,
                    modelName:
                        'projects/test/locations/global/endpoints/custom',
                },
            },
        });
        expect(getModel(custom).model.modelId).toBe(
            'projects/test/locations/global/endpoints/custom',
        );
        expect(getAvailableModels(custom)).toEqual([
            expect.objectContaining({
                provider: 'vertex',
                modelId: 'projects/test/locations/global/endpoints/custom',
                displayName:
                    'projects/test/locations/global/endpoints/custom (Vertex AI)',
            }),
        ]);
        expect(
            getModel(custom, {
                modelName: 'previous-server-model',
                trustPinnedModelName: true,
            }).model.modelId,
        ).toBe('previous-server-model');
    });

    it('uses the same model for fast tasks unless an instance fast model is configured', () => {
        expect(getFastModelForAccessibleKey(config, null).model.modelId).toBe(
            'gemini-3.8-flash',
        );
        const fastConfig = aiCopilotConfigSchema.parse({
            ...config,
            providers: {
                vertex: {
                    ...config.providers.vertex,
                    fastModelName: 'fast-model',
                },
            },
        });
        expect(
            getFastModelForAccessibleKey(fastConfig, null).model.modelId,
        ).toBe('fast-model');
    });

    it('lists and routes the configured fast model without changing the default', () => {
        const fastConfig = aiCopilotConfigSchema.parse({
            ...config,
            providers: {
                vertex: {
                    ...config.providers.vertex,
                    fastModelName: 'gemini-3.5-flash-lite',
                },
            },
        });
        expect(
            getAvailableModels(fastConfig).map((preset) => preset.modelId),
        ).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
        expect(getDefaultModel(fastConfig)).toEqual(getDefaultModel(config));
        expect(
            getModel(fastConfig, { modelName: 'gemini-3.5-flash-lite' }).model
                .modelId,
        ).toBe('gemini-3.5-flash-lite');
        expect(
            getModel(fastConfig, { modelName: 'unconfigured-model' }).model
                .modelId,
        ).toBe('gemini-3.8-flash');
        expect(
            getModel(fastConfig, {
                modelName: 'gemini-3.8-flash',
                useFastModel: true,
            }).model.modelId,
        ).toBe('gemini-3.5-flash-lite');
        expect(
            getFastModelForAccessibleKey(fastConfig, null).model.modelId,
        ).toBe('gemini-3.5-flash-lite');
    });

    it('lists a model only once when the primary and fast model match', () => {
        const sameFastModel = aiCopilotConfigSchema.parse({
            ...config,
            providers: {
                vertex: {
                    ...config.providers.vertex,
                    fastModelName: 'gemini-3.8-flash',
                },
            },
        });
        expect(getAvailableModels(sameFastModel)).toEqual(
            getAvailableModels(config),
        );
    });

    it('passes project/location to ADC and prevents SDK API-key fallback', () => {
        vi.stubEnv('GOOGLE_VERTEX_API_KEY', 'ambient-key');
        const adcConfig = aiCopilotConfigSchema.parse({
            ...config,
            providers: {
                vertex: {
                    auth: {
                        type: 'adc',
                        project: 'test-project',
                        location: 'global',
                    },
                },
            },
        });
        expect(getModel(adcConfig).model.provider).toBe('vertex');
        expect(createVertex).toHaveBeenCalledWith({
            apiKey: '',
            project: 'test-project',
            location: 'global',
            fetch: expect.any(Function),
        });
    });

    it('fails clearly if the requested Vertex provider is not configured', () => {
        expect(() => getModel({ ...config, providers: {} })).toThrow(
            'Vertex configuration is required',
        );
    });
});

describe('Vertex SDK transport', () => {
    it.each(['generate', 'stream'])(
        'preserves original tool JSON Schema for %s',
        async (mode) => {
            const inputSchema = jsonSchema({
                type: 'object',
                properties: {
                    groupBy: {
                        type: ['array', 'null'],
                        description: 'Fields to group by',
                        items: { type: 'string', pattern: '^[a-z_]+$' },
                        minItems: 1,
                    },
                    filter: {
                        description: 'A string or numeric filter',
                        anyOf: [{ type: 'string' }, { type: 'number' }],
                    },
                },
                required: ['groupBy'],
                additionalProperties: false,
            });
            const fetchMock = vi
                .fn<typeof fetch>()
                .mockImplementation(async () =>
                    mode === 'generate'
                        ? Response.json(completion)
                        : new Response(
                              `data: ${JSON.stringify(completion)}\n\n`,
                              {
                                  headers: {
                                      'content-type': 'text/event-stream',
                                  },
                              },
                          ),
                );
            vi.stubGlobal('fetch', fetchMock);
            const options = {
                ...getModel(config),
                prompt: 'Hello',
                tools: {
                    visualize: tool({
                        description: 'Make a chart',
                        inputSchema,
                    }),
                },
                maxRetries: 0,
            };
            const result =
                mode === 'generate'
                    ? await generateText(options)
                    : streamText(options);
            expect(await result.text).toBe('Hello');
            const body = fetchMock.mock.calls[0]?.[1]?.body;
            if (typeof body !== 'string')
                throw new Error('Expected JSON request');
            expect(JSON.parse(body)).toMatchObject({
                tools: [
                    {
                        functionDeclarations: [
                            {
                                name: 'visualize',
                                description: 'Make a chart',
                                parametersJsonSchema:
                                    await inputSchema.jsonSchema,
                            },
                        ],
                    },
                ],
            });
            expect(body).not.toContain('"parameters":');
        },
    );

    it('isolates tool schemas between concurrent calls on the same model', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockImplementation(async () => Response.json(completion));
        vi.stubGlobal('fetch', fetchMock);
        const model = getModel(config);
        await Promise.all(
            ['first', 'second'].map(async (field) =>
                generateText({
                    ...model,
                    prompt: field,
                    tools: {
                        lookup: tool({
                            inputSchema: z.object({ [field]: z.string() }),
                        }),
                    },
                    maxRetries: 0,
                }),
            ),
        );
        for (const [, init] of fetchMock.mock.calls) {
            if (typeof init?.body !== 'string')
                throw new Error('Expected JSON request');
            const body = z
                .object({
                    contents: z.array(
                        z.object({
                            parts: z.array(z.object({ text: z.string() })),
                        }),
                    ),
                    tools: z.array(
                        z.object({
                            functionDeclarations: z.array(
                                z.object({
                                    parametersJsonSchema: z.object({
                                        required: z.array(z.string()),
                                    }),
                                }),
                            ),
                        }),
                    ),
                })
                .parse(JSON.parse(init.body));
            expect(
                body.tools[0]?.functionDeclarations[0]?.parametersJsonSchema
                    .required,
            ).toEqual([body.contents[0]?.parts[0]?.text]);
        }
    });

    it('preserves Gemini thought signatures across a tool round trip', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                Response.json({
                    ...completion,
                    candidates: [
                        {
                            content: {
                                role: 'model',
                                parts: [
                                    {
                                        functionCall: {
                                            name: 'lookup',
                                            args: {},
                                        },
                                        thoughtSignature:
                                            'test-thought-signature',
                                    },
                                ],
                            },
                            finishReason: 'STOP',
                        },
                    ],
                }),
            )
            .mockResolvedValueOnce(Response.json(completion));
        vi.stubGlobal('fetch', fetchMock);
        const result = await generateText({
            ...getModel(config),
            prompt: 'Look up the test value',
            tools: {
                lookup: tool({
                    inputSchema: z.object({}),
                    execute: async () => ({ value: 42 }),
                }),
            },
            stopWhen: stepCountIs(2),
            maxRetries: 0,
        });
        expect(result.text).toBe('Hello');
        expect(result.steps).toHaveLength(2);
        expect(fetchMock.mock.calls[1]?.[1]?.body).toContain(
            'test-thought-signature',
        );
        expect(fetchMock.mock.calls[1]?.[1]?.body).toContain(
            'functionResponse',
        );
    });

    it('sends the API key to the Express endpoint and returns token usage', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(Response.json(completion));
        vi.stubGlobal('fetch', fetchMock);
        const result = await generateText({
            ...getModel(config),
            prompt: 'Hello',
            maxRetries: 0,
        });
        expect(result.text).toBe('Hello');
        expect(result.usage.totalTokens).toBe(4);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash:generateContent',
            expect.objectContaining({
                headers: expect.objectContaining({
                    'x-goog-api-key': 'test-vertex-key',
                }),
            }),
        );
    });

    it('streams responses from the Vertex SSE endpoint', async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
            new Response(`data: ${JSON.stringify(completion)}\n\n`, {
                headers: { 'content-type': 'text/event-stream' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);
        const result = streamText({
            ...getModel(config),
            prompt: 'Hello',
            maxRetries: 0,
        });
        expect(await result.text).toBe('Hello');
        expect(fetchMock.mock.calls[0]?.[0]).toContain(
            ':streamGenerateContent?alt=sse',
        );
    });

    it('honors the non-streaming endpoint capability', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(Response.json(completion));
        vi.stubGlobal('fetch', fetchMock);
        const nonStreamingConfig = aiCopilotConfigSchema.parse({
            ...config,
            providers: {
                vertex: {
                    ...config.providers.vertex,
                    supportsStreaming: false,
                },
            },
        });
        const result = streamText({
            ...getModel(nonStreamingConfig),
            prompt: 'Hello',
            maxRetries: 0,
        });
        expect(await result.text).toBe('Hello');
        expect(fetchMock.mock.calls[0]?.[0]).toContain(':generateContent');
    });
});
