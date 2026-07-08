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
    getDefaultModel,
    getModel,
} from './index';
import type { ModelPreset } from './presets';

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

    it('keeps preset-specific provider options while staying sequential', () => {
        const { providerOptions } = getModel(copilotConfigWithStreaming(true), {
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

    it('wraps the model with simulateStreamingMiddleware when the provider does not support streaming', () => {
        const { model } = getModel(copilotConfigWithStreaming(false));

        expect(wrapLanguageModel).toHaveBeenCalledTimes(1);
        expect(model).toBe(vi.mocked(wrapLanguageModel).mock.results[0].value);
    });
});

describe('filterModelsForOrg', () => {
    const preset = (
        overrides: Pick<
            ModelPreset<'openai' | 'anthropic' | 'bedrock'>,
            'name' | 'provider' | 'modelId'
        > &
            Partial<ModelPreset<'openai' | 'anthropic' | 'bedrock'>>,
    ): ModelPreset<'openai' | 'anthropic' | 'bedrock'> => ({
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
