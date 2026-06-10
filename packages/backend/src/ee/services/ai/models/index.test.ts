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
import { applyStreamingCapability, getModel } from './index';

jest.mock('ai', () => {
    const actual = jest.requireActual('ai');
    return {
        ...actual,
        wrapLanguageModel: jest.fn(actual.wrapLanguageModel),
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

describe('getModel', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('does not wrap the model when the provider supports streaming', () => {
        getModel(copilotConfigWithStreaming(true));

        expect(wrapLanguageModel).not.toHaveBeenCalled();
    });

    it('wraps the model with simulateStreamingMiddleware when the provider does not support streaming', () => {
        const { model } = getModel(copilotConfigWithStreaming(false));

        expect(wrapLanguageModel).toHaveBeenCalledTimes(1);
        expect(model).toBe(
            jest.mocked(wrapLanguageModel).mock.results[0].value,
        );
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
