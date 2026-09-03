import {
    readUIMessageStream,
    stepCountIs,
    streamText,
    tool,
    wrapLanguageModel,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import {
    applyStreamingCapability,
    filterModelsForOrg,
    getAvailableModels,
    getCompactionModelMetadata,
    getDefaultModel,
    getFastModelForAccessibleKey,
    getModel,
    MODEL_PRESETS,
    pickAmbientAnthropicPreset,
} from './index';
import type { ModelPreset, ModelPresetProvider } from './presets';

vi.mock('ai', async () => {
    const actual = await vi.importActual<typeof import('ai')>('ai');
    return {
        ...actual,
        wrapLanguageModel: vi.fn(actual.wrapLanguageModel),
    };
});

const baseCopilotConfig = lightdashConfigMock.ai.copilot;

const copilotConfigWithStreaming = (supportsStreaming: boolean) => ({
    ...baseCopilotConfig,
    providers: {
        ...baseCopilotConfig.providers,
        openai: {
            ...baseCopilotConfig.providers.openai!,
            supportsStreaming,
        },
    },
});

const copilotConfigWithZeroDataRetention = () => {
    const config = copilotConfigWithStreaming(true);
    return {
        ...config,
        providers: {
            ...config.providers,
            openai: {
                ...config.providers.openai,
                zeroDataRetention: true,
            },
        },
    };
};

describe('getDefaultModel', () => {
    it('returns the default model when the configured provider is present', () => {
        expect(getDefaultModel(baseCopilotConfig)).toEqual({
            name: baseCopilotConfig.providers.openai!.modelName,
            provider: 'openai',
        });
    });

    it('returns null when the configured default provider is not set up', () => {
        // Reproduces the blank-Settings-page bug: defaultProvider `openai`
        // with no OPENAI_API_KEY (providers.openai absent) must degrade to
        // null rather than throw, so /aiAgents/admin/settings stays 2xx.
        const configWithoutProvider = {
            ...baseCopilotConfig,
            defaultProvider: 'openai' as const,
            providers: {},
        };

        expect(getDefaultModel(configWithoutProvider)).toBeNull();
    });

    it('returns null when the default azure provider is not configured', () => {
        const configWithoutAzure = {
            ...baseCopilotConfig,
            defaultProvider: 'azure' as const,
            providers: {},
        };

        expect(getDefaultModel(configWithoutAzure)).toBeNull();
    });
});

describe('getModel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('forces sequential tool execution for OpenAI presets', () => {
        // Regression: presets used to hardcode parallelToolCalls: true, which
        // (spread last in the factory) silently re-enabled parallel tool calls
        // and reintroduced the dropped-execution bug.
        const { providerOptions } = getModel(copilotConfigWithStreaming(true), {
            modelName: 'gpt-5.5',
        });

        if (!providerOptions || !('openai' in providerOptions)) {
            throw new Error('expected openai provider options');
        }
        expect(providerOptions.openai.parallelToolCalls).toBe(false);
    });

    it('uses low OpenAI reasoning without summaries when extended reasoning is disabled', () => {
        const { callOptions, providerOptions } = getModel(
            copilotConfigWithStreaming(true),
            {
                enableReasoning: false,
                modelName: 'gpt-5.5',
            },
        );

        if (!providerOptions || !('openai' in providerOptions)) {
            throw new Error('expected openai provider options');
        }
        expect(callOptions).toEqual({});
        expect(providerOptions.openai.reasoningEffort).toBe('low');
        expect(providerOptions.openai.reasoningSummary).toBeUndefined();
    });

    it.each([false, true])(
        'keeps OpenAI zero data retention stateless when extended reasoning is %s',
        (enableReasoning) => {
            const { providerOptions } = getModel(
                copilotConfigWithZeroDataRetention(),
                {
                    enableReasoning,
                    modelName: 'gpt-5.5',
                },
            );

            if (!providerOptions || !('openai' in providerOptions)) {
                throw new Error('expected openai provider options');
            }
            expect(providerOptions.openai.store).toBe(false);
            expect(providerOptions.openai.include).toEqual([
                'reasoning.encrypted_content',
            ]);
        },
    );

    it('enables OpenAI reasoning only when requested', () => {
        const { providerOptions } = getModel(copilotConfigWithStreaming(true), {
            enableReasoning: true,
            modelName: 'gpt-5.5',
        });

        if (!providerOptions || !('openai' in providerOptions)) {
            throw new Error('expected openai provider options');
        }
        expect(providerOptions.openai.reasoningEffort).toBe('medium');
        expect(providerOptions.openai.reasoningSummary).toBe('auto');
    });

    it('keeps preset-specific reasoning effort when enabled', () => {
        const { providerOptions } = getModel(copilotConfigWithStreaming(true), {
            enableReasoning: true,
            modelName: 'gpt-5-mini',
        });

        if (!providerOptions || !('openai' in providerOptions)) {
            throw new Error('expected openai provider options');
        }
        expect(providerOptions.openai.parallelToolCalls).toBe(false);
        expect(providerOptions.openai.reasoningEffort).toBe('minimal');
    });

    it('does not wrap the model when the provider supports streaming', () => {
        getModel(copilotConfigWithStreaming(true));

        expect(wrapLanguageModel).not.toHaveBeenCalled();
    });

    it('stamps lightdash-managed when the resolved provider is not BYO', () => {
        const { keyManagement } = getModel(copilotConfigWithStreaming(true));
        expect(keyManagement).toBe('lightdash-managed');
    });

    it('stamps self-managed when the resolved provider is in byoProviders', () => {
        const { keyManagement } = getModel({
            ...copilotConfigWithStreaming(true),
            byoProviders: ['openai'],
        });
        expect(keyManagement).toBe('self-managed');
    });

    it('stamps lightdash-managed when a different provider is BYO', () => {
        const { keyManagement } = getModel({
            ...copilotConfigWithStreaming(true),
            byoProviders: ['anthropic'],
        });
        expect(keyManagement).toBe('lightdash-managed');
    });

    it('honors a pinned Azure deployment name', () => {
        const { model } = getModel(
            {
                ...baseCopilotConfig,
                defaultProvider: 'azure',
                providers: {
                    azure: {
                        endpoint: 'https://example.openai.azure.com',
                        apiKey: 'test',
                        apiVersion: '2025-01-01',
                        deploymentName: 'current-deployment',
                        deploymentSupportsReasoning: false,
                        embeddingDeploymentName: 'embedding',
                        useDeploymentBasedUrls: true,
                        customHeaders: {},
                        supportsStreaming: true,
                    },
                },
            },
            {
                provider: 'azure',
                modelName: 'run-selected-deployment',
                trustPinnedModelName: true,
            },
        );

        expect(model.modelId).toBe('run-selected-deployment');
    });

    it('honors a pinned OpenRouter model name', () => {
        const { model } = getModel(
            {
                ...baseCopilotConfig,
                defaultProvider: 'openrouter',
                providers: {
                    openrouter: {
                        apiKey: 'test',
                        modelName: 'current/model',
                        allowedProviders: ['openai'],
                        sortOrder: 'latency',
                        customHeaders: {},
                        supportsStreaming: true,
                    },
                },
            },
            {
                provider: 'openrouter',
                modelName: 'run-selected/model',
                trustPinnedModelName: true,
            },
        );

        expect(model.modelId).toBe('run-selected/model');
    });

    it('honors an allowlisted OpenRouter model selection', () => {
        const { model } = getModel(
            {
                ...baseCopilotConfig,
                defaultProvider: 'openrouter',
                providers: {
                    openrouter: {
                        apiKey: 'test',
                        modelName: 'qwen/qwen3.8-flash',
                        availableModels: [
                            'qwen/qwen3.8-flash',
                            'moonshotai/kimi-k3',
                        ],
                        allowedProviders: [],
                        sortOrder: 'latency',
                        customHeaders: {},
                        supportsStreaming: true,
                    },
                },
            },
            {
                provider: 'openrouter',
                modelName: 'moonshotai/kimi-k3',
            },
        );

        expect(model.modelId).toBe('moonshotai/kimi-k3');
    });

    it('ignores untrusted Azure and OpenRouter model-name overrides', () => {
        const azure = getModel(
            {
                ...baseCopilotConfig,
                defaultProvider: 'azure',
                providers: {
                    azure: {
                        endpoint: 'https://example.openai.azure.com',
                        apiKey: 'test',
                        apiVersion: '2025-01-01',
                        deploymentName: 'configured-deployment',
                        deploymentSupportsReasoning: false,
                        embeddingDeploymentName: 'embedding',
                        useDeploymentBasedUrls: true,
                        customHeaders: {},
                        supportsStreaming: true,
                    },
                },
            },
            { provider: 'azure', modelName: 'caller-controlled-deployment' },
        );
        const openrouter = getModel(
            {
                ...baseCopilotConfig,
                defaultProvider: 'openrouter',
                providers: {
                    openrouter: {
                        apiKey: 'test',
                        modelName: 'configured/model',
                        allowedProviders: ['openai'],
                        sortOrder: 'latency',
                        customHeaders: {},
                        supportsStreaming: true,
                    },
                },
            },
            {
                provider: 'openrouter',
                modelName: 'caller-controlled/model',
            },
        );

        expect(azure.model.modelId).toBe('configured-deployment');
        expect(openrouter.model.modelId).toBe('configured/model');
    });

    it('resolves a pinned Bedrock inference-profile model id', () => {
        const { model } = getModel(
            {
                ...baseCopilotConfig,
                defaultProvider: 'bedrock',
                providers: {
                    bedrock: {
                        apiKey: 'test',
                        region: 'eu-west-1',
                        inferenceProfilePrefix: 'jp',
                        modelName: 'claude-sonnet-5',
                        embeddingModelName: 'amazon.titan-embed-text-v2:0',
                        customHeaders: {},
                        supportsStreaming: true,
                    },
                },
            },
            {
                provider: 'bedrock',
                modelName: 'jp.anthropic.claude-opus-5',
            },
        );

        expect(model.modelId).toBe('jp.anthropic.claude-opus-5');
    });

    it('stamps self-managed when the resolved provider is instance self-managed', () => {
        const { keyManagement } = getModel({
            ...copilotConfigWithStreaming(true),
            selfManagedProviders: ['openai'],
        });
        expect(keyManagement).toBe('self-managed');
    });

    it('stamps lightdash-managed when a different provider is instance self-managed', () => {
        const { keyManagement } = getModel({
            ...copilotConfigWithStreaming(true),
            selfManagedProviders: ['anthropic'],
        });
        expect(keyManagement).toBe('lightdash-managed');
    });

    it('wraps the model with simulateStreamingMiddleware when the provider does not support streaming', () => {
        const { model } = getModel(copilotConfigWithStreaming(false));

        expect(wrapLanguageModel).toHaveBeenCalledTimes(1);
        expect(model).toBe(vi.mocked(wrapLanguageModel).mock.results[0].value);
    });
});

describe('OpenRouter model options', () => {
    it('surfaces the default and allowlisted models for the picker', () => {
        const models = getAvailableModels({
            ...baseCopilotConfig,
            defaultProvider: 'openrouter',
            providers: {
                openrouter: {
                    apiKey: 'test',
                    modelName: 'qwen/qwen3.5-9b',
                    availableModels: [
                        'qwen/qwen3.5-9b',
                        'moonshotai/kimi-k3',
                        'z-ai/glm-5.3-flash',
                    ],
                    allowedProviders: [],
                    sortOrder: 'latency',
                    customHeaders: {},
                    supportsStreaming: true,
                },
            },
        });

        expect(models).toMatchObject([
            {
                provider: 'openrouter',
                name: 'qwen/qwen3.5-9b',
                displayName: 'Qwen3.5 9B',
                groupLabel: 'Qwen',
                description:
                    'Compact multimodal model for affordable reasoning, coding, and visual analysis',
            },
            {
                provider: 'openrouter',
                name: 'moonshotai/kimi-k3',
                displayName: 'Kimi K3',
                groupLabel: 'Moonshot AI',
                description:
                    'Open-weight multimodal model for complex coding and long-running agents',
            },
            {
                provider: 'openrouter',
                name: 'z-ai/glm-5.3-flash',
                displayName: 'GLM 5.3 Flash',
                groupLabel: 'Z.ai',
                description:
                    'Efficient multimodal model for coding and long-context agent tasks',
            },
        ]);
    });
});

describe('Google Gemini models', () => {
    const googleCopilotConfig = {
        ...baseCopilotConfig,
        defaultProvider: 'google' as const,
        providers: {
            google: {
                apiKey: 'fake-gemini-key',
                modelName: 'gemini-3.8-flash',
                availableModels: undefined,
                supportsStreaming: true,
            },
        },
    };

    it('lists the shipped Gemini presets', () => {
        expect(
            getAvailableModels(googleCopilotConfig).map((model) => model.name),
        ).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
    });

    it('resolves Gemini through the Interactions-backed model factory', () => {
        const { model, providerOptions } = getModel(googleCopilotConfig);

        expect(model.modelId).toBe('gemini-3.8-flash');
        expect(providerOptions).toEqual({
            google: { store: false, thinkingLevel: 'low' },
        });
    });

    it('uses Flash-Lite for lightweight work', () => {
        const { model } = getFastModelForAccessibleKey(
            { ...googleCopilotConfig, byoProviders: ['google'] },
            null,
        );

        expect(model.modelId).toBe('gemini-3.5-flash-lite');
    });

    it('uses the Gemini context window for compaction', () => {
        expect(getCompactionModelMetadata(googleCopilotConfig)).toEqual({
            supportsCompaction: true,
            contextWindowTokens: 400_000,
        });
    });
});

describe('custom OpenAI-compatible gateway models', () => {
    const gatewayConfig = (
        openaiOverrides: Partial<
            NonNullable<typeof baseCopilotConfig.providers.openai>
        > & { baseUrl?: string },
    ) => ({
        ...baseCopilotConfig,
        providers: {
            openai: {
                ...baseCopilotConfig.providers.openai!,
                baseUrl: 'https://litellm.example.com',
                ...openaiOverrides,
            },
        },
    });

    const customModelName = 'bedrock/eu.anthropic.claude-sonnet-4-6';

    it('surfaces a non-preset OPENAI_MODEL_NAME as a selectable pass-through model', () => {
        const models = getAvailableModels(
            gatewayConfig({ modelName: customModelName }),
        );

        expect(models[0]).toMatchObject({
            provider: 'openai',
            name: customModelName,
            modelId: customModelName,
            contextWindowTokens: null,
        });
        // presets remain available alongside the configured model
        expect(models.map((m) => m.name)).toContain('gpt-5.5');
    });

    it('resolves OPENAI_AVAILABLE_MODELS entries to presets or pass-through models', () => {
        const models = getAvailableModels(
            gatewayConfig({
                modelName: customModelName,
                availableModels: ['gpt-5.5', customModelName],
            }),
        );

        expect(models).toHaveLength(2);
        expect(models.find((m) => m.name === 'gpt-5.5')?.modelId).toBe(
            'gpt-5.5-2026-04-23',
        );
        expect(models.find((m) => m.name === customModelName)?.modelId).toBe(
            customModelName,
        );
    });

    it('keeps dropping unknown names when no custom base URL is configured', () => {
        const withoutBaseUrl = getAvailableModels(
            gatewayConfig({
                baseUrl: undefined,
                modelName: customModelName,
                availableModels: [customModelName, 'gpt-5.5'],
            }),
        );

        expect(withoutBaseUrl.map((m) => m.name)).toEqual(['gpt-5.5']);
    });

    it('sends the configured custom model name to the endpoint', () => {
        const { model } = getModel(
            gatewayConfig({ modelName: customModelName }),
        );

        expect(model.modelId).toBe(customModelName);
    });

    it('resolves a custom model requested by name (e.g. from an agent setting)', () => {
        const { model } = getModel(
            gatewayConfig({
                availableModels: [customModelName, 'gpt-5.5'],
            }),
            { modelName: customModelName },
        );

        expect(model.modelId).toBe(customModelName);
    });

    it('disables compaction for custom models with unknown context windows', () => {
        expect(
            getCompactionModelMetadata(
                gatewayConfig({ modelName: customModelName }),
            ),
        ).toEqual({
            supportsCompaction: false,
            contextWindowTokens: null,
        });
    });

    it('keeps compaction metadata for preset models on a custom gateway', () => {
        expect(
            getCompactionModelMetadata(gatewayConfig({ modelName: 'gpt-5.5' })),
        ).toEqual({
            supportsCompaction: true,
            contextWindowTokens: 265000,
        });
    });
});

describe('filterModelsForOrg', () => {
    const preset = (
        overrides: Pick<
            ModelPreset<ModelPresetProvider>,
            'name' | 'provider' | 'modelId'
        > & { hiddenUnlessKeyAccess?: boolean },
    ): ModelPreset<ModelPresetProvider> => ({
        displayName: overrides.name,
        description: 'test preset',
        contextWindowTokens: 200000,
        supportsReasoning: true,
        callOptions: {},
        providerOptions: undefined,
        ...overrides,
    });

    const presets = [
        preset({
            name: 'claude-opus-4-8',
            provider: 'anthropic',
            modelId: 'claude-opus-4-8',
            hiddenUnlessKeyAccess: true,
        }),
        preset({
            name: 'claude-sonnet-5',
            provider: 'anthropic',
            modelId: 'claude-sonnet-5',
        }),
        preset({
            name: 'gpt-5.5',
            provider: 'openai',
            modelId: 'gpt-5.5-2026-04-23',
        }),
        preset({
            name: 'claude-haiku-4-5',
            provider: 'bedrock',
            modelId: 'anthropic.claude-haiku-4-5-20251001-v1:0',
        }),
    ];

    it('excludes hidden presets when there is no key access', () => {
        const result = filterModelsForOrg(presets, {
            modelVisibility: null,
            keyAccessibleModelIds: null,
        });
        expect(result.map((p) => p.name)).toEqual([
            'claude-sonnet-5',
            'gpt-5.5',
            'claude-haiku-4-5',
        ]);
    });

    it('includes hidden presets when the provider key can access them', () => {
        const result = filterModelsForOrg(presets, {
            modelVisibility: null,
            keyAccessibleModelIds: { anthropic: ['claude-opus-4-8'] },
        });
        expect(result.map((p) => p.name)).toContain('claude-opus-4-8');
    });

    it('unlocks a hidden preset when the key lists a dated variant of it', () => {
        const result = filterModelsForOrg(presets, {
            modelVisibility: null,
            keyAccessibleModelIds: {
                anthropic: ['claude-opus-4-8-20260115'],
            },
        });
        expect(result.map((p) => p.name)).toContain('claude-opus-4-8');
    });

    it('does not unlock a hidden preset on a false-prefix model id', () => {
        const result = filterModelsForOrg(presets, {
            modelVisibility: null,
            keyAccessibleModelIds: { anthropic: ['claude-opus-4-80'] },
        });
        expect(result.map((p) => p.name)).not.toContain('claude-opus-4-8');
    });

    it('does not unlock hidden presets via another provider key', () => {
        const result = filterModelsForOrg(presets, {
            modelVisibility: null,
            keyAccessibleModelIds: { openai: ['claude-opus-4-8'] },
        });
        expect(result.map((p) => p.name)).not.toContain('claude-opus-4-8');
    });

    it('drops disabled providers entirely', () => {
        const result = filterModelsForOrg(presets, {
            modelVisibility: { openai: { enabled: false } },
            keyAccessibleModelIds: null,
        });
        expect(result.map((p) => p.name)).toEqual([
            'claude-sonnet-5',
            'claude-haiku-4-5',
        ]);
    });

    it('intersects with allowedModels when set', () => {
        const result = filterModelsForOrg(presets, {
            modelVisibility: {
                anthropic: {
                    enabled: true,
                    allowedModels: ['claude-opus-4-8'],
                },
            },
            keyAccessibleModelIds: { anthropic: ['claude-opus-4-8'] },
        });
        expect(result.map((p) => p.name)).toEqual([
            'claude-opus-4-8',
            'gpt-5.5',
            'claude-haiku-4-5',
        ]);
    });

    it('treats empty allowedModels as all models of the provider', () => {
        const result = filterModelsForOrg(presets, {
            modelVisibility: {
                anthropic: { enabled: true, allowedModels: [] },
            },
            keyAccessibleModelIds: null,
        });
        expect(result.map((p) => p.name)).toEqual([
            'claude-sonnet-5',
            'gpt-5.5',
            'claude-haiku-4-5',
        ]);
    });

    it('never filters bedrock presets by visibility', () => {
        const result = filterModelsForOrg(presets, {
            modelVisibility: {
                anthropic: { enabled: false },
                openai: { enabled: false },
            },
            keyAccessibleModelIds: null,
        });
        expect(result.map((p) => p.name)).toEqual(['claude-haiku-4-5']);
    });

    // Guards the core promise against the real preset table, not fixtures
    it('hides claude-opus-4-8 by default but surfaces it when the anthropic key unlocks it', () => {
        const realPresets = MODEL_PRESETS.anthropic;
        expect(realPresets.some((p) => p.name === 'claude-opus-4-8')).toBe(
            true,
        );

        const noKey = filterModelsForOrg(realPresets, {
            modelVisibility: null,
            keyAccessibleModelIds: null,
        });
        expect(noKey.map((p) => p.name)).not.toContain('claude-opus-4-8');

        const withKey = filterModelsForOrg(realPresets, {
            modelVisibility: null,
            keyAccessibleModelIds: { anthropic: ['claude-opus-4-8'] },
        });
        expect(withKey.map((p) => p.name)).toContain('claude-opus-4-8');
    });

    it('offers claude-opus-5 to every org, with or without key access', () => {
        const realPresets = MODEL_PRESETS.anthropic;
        expect(realPresets.some((p) => p.name === 'claude-opus-5')).toBe(true);

        const noKey = filterModelsForOrg(realPresets, {
            modelVisibility: null,
            keyAccessibleModelIds: null,
        });
        expect(noKey.map((p) => p.name)).toContain('claude-opus-5');

        const withKey = filterModelsForOrg(realPresets, {
            modelVisibility: null,
            keyAccessibleModelIds: { anthropic: ['claude-opus-5'] },
        });
        expect(withKey.map((p) => p.name)).toContain('claude-opus-5');
    });
});

describe('applyStreamingCapability', () => {
    const usage = {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 5, text: 5, reasoning: 0 },
        totalTokens: 15,
    };

    const createNonStreamingMockModel = () => {
        let generateCallCount = 0;
        return new MockLanguageModelV3({
            modelId: 'mock-gateway-model',
            doStream: async () => {
                throw new Error(
                    'doStream called — gateway stream endpoint hit!',
                );
            },
            doGenerate: async () => {
                generateCallCount += 1;
                return generateCallCount === 1
                    ? {
                          content: [
                              {
                                  type: 'tool-call' as const,
                                  toolCallId: 'tc1',
                                  toolName: 'getWeather',
                                  input: JSON.stringify({ city: 'Tallinn' }),
                              },
                          ],
                          finishReason: {
                              unified: 'tool-calls' as const,
                              raw: undefined,
                          },
                          usage,
                          warnings: [],
                      }
                    : {
                          content: [
                              {
                                  type: 'text' as const,
                                  text: 'The weather in Tallinn is sunny.',
                              },
                          ],
                          finishReason: {
                              unified: 'stop' as const,
                              raw: undefined,
                          },
                          usage,
                          warnings: [],
                      };
            },
        });
    };

    const toModelProperties = (model: MockLanguageModelV3) => ({
        model,
        callOptions: {},
        providerOptions: undefined,
    });

    it('returns the model unwrapped when streaming is supported', () => {
        const mockModel = createNonStreamingMockModel();
        const modelProperties = toModelProperties(mockModel);

        expect(applyStreamingCapability(modelProperties, true)).toBe(
            modelProperties,
        );
    });

    it('serves streamText through doGenerate only, preserving multi-step tool calls', async () => {
        const mockModel = createNonStreamingMockModel();
        const { model } = applyStreamingCapability(
            toModelProperties(mockModel),
            false,
        );

        const getWeather = tool({
            description: 'Get weather',
            inputSchema: z.object({ city: z.string() }),
            execute: async ({ city }) => ({ city, forecast: 'sunny' }),
        });

        const result = streamText({
            model,
            tools: { getWeather },
            stopWhen: stepCountIs(5),
            prompt: 'Weather in Tallinn?',
        });

        let lastUiMessage;
        // eslint-disable-next-line no-restricted-syntax
        for await (const uiMessage of readUIMessageStream({
            stream: result.toUIMessageStream(),
        })) {
            lastUiMessage = uiMessage;
        }

        expect(mockModel.doStreamCalls).toHaveLength(0);
        expect(mockModel.doGenerateCalls).toHaveLength(2);
        expect(await result.text).toBe('The weather in Tallinn is sunny.');
        expect(lastUiMessage?.parts.map((part) => part.type)).toEqual([
            'step-start',
            'tool-getWeather',
            'step-start',
            'text',
        ]);
    });
});

describe('pickAmbientAnthropicPreset', () => {
    it('prefers the fast model when the key can serve it', () => {
        const preset = pickAmbientAnthropicPreset([
            'claude-haiku-4-5-20251001',
            'claude-opus-4-8',
        ]);
        expect(preset?.modelId).toBe('claude-haiku-4-5-20251001');
    });

    it('falls back to an accessible model when the key lacks the fast one', () => {
        const preset = pickAmbientAnthropicPreset(['claude-opus-4-8']);
        expect(preset?.modelId).toBe('claude-opus-4-8');
    });

    it('optimistically returns the fast model when the probe failed (null)', () => {
        const preset = pickAmbientAnthropicPreset(null);
        expect(preset?.modelId).toBe('claude-haiku-4-5-20251001');
    });

    it('returns null when the key can access no shipped preset', () => {
        const preset = pickAmbientAnthropicPreset(['some-unknown-model']);
        expect(preset).toBeNull();
    });
});

describe('getFastModelForAccessibleKey', () => {
    const anthropicByoConfig = {
        ...baseCopilotConfig,
        defaultProvider: 'anthropic' as const,
        byoProviders: ['anthropic' as const],
        providers: {
            ...baseCopilotConfig.providers,
            anthropic: {
                apiKey: 'sk-ant-x',
                modelName: 'claude-sonnet-5',
                supportsStreaming: false,
                customHeaders: {},
            },
        },
    };

    it('uses the fast model when the BYO key can serve it', () => {
        const { model } = getFastModelForAccessibleKey(anthropicByoConfig, [
            'claude-haiku-4-5-20251001',
        ]);
        expect(model.modelId).toBe('claude-haiku-4-5-20251001');
    });

    it('falls back to an accessible model (opus 4.8) when the key lacks the fast one', () => {
        const { model } = getFastModelForAccessibleKey(anthropicByoConfig, [
            'claude-opus-4-8',
        ]);
        expect(model.modelId).toBe('claude-opus-4-8');
    });

    it('preserves the managed-instance Anthropic fast path', () => {
        const { model } = getFastModelForAccessibleKey(
            {
                ...anthropicByoConfig,
                defaultProvider: 'openai',
                byoProviders: [],
            },
            ['claude-haiku-4-5-20251001'],
        );

        expect(model.modelId).toBe('claude-haiku-4-5-20251001');
    });

    it('never uses the instance Anthropic key for a Google-only BYO org', () => {
        const { model } = getFastModelForAccessibleKey(
            {
                ...anthropicByoConfig,
                defaultProvider: 'google',
                byoProviders: ['google'],
                providers: {
                    ...anthropicByoConfig.providers,
                    google: {
                        apiKey: 'fake-gemini-key',
                        modelName: 'gemini-3.8-flash',
                        supportsStreaming: true,
                    },
                },
            },
            ['claude-haiku-4-5-20251001'],
        );

        expect(model.modelId).toBe('gemini-3.5-flash-lite');
        expect(model.provider).toContain('google');
    });
});
