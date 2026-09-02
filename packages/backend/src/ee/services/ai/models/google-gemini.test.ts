import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, streamText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import {
    getGoogleGeminiModel,
    withGoogleInteractionsDefaults,
} from './google-gemini';
import type { ModelPreset } from './presets';

const mockGoogleInteractions = vi.hoisted(() => vi.fn());

vi.mock('@ai-sdk/google', () => ({
    createGoogleGenerativeAI: vi.fn(() => ({
        interactions: mockGoogleInteractions,
    })),
}));

const preset: ModelPreset<'google'> = {
    name: 'gemini-3.8-flash',
    provider: 'google',
    modelId: 'gemini-3.8-flash',
    displayName: 'Gemini 3.8 Flash',
    description: '',
    contextWindowTokens: 1_048_576,
    supportsReasoning: true,
    callOptions: {},
    providerOptions: undefined,
};

const usage = {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
    totalTokens: 2,
};

const createMockModel = () =>
    new MockLanguageModelV3({
        modelId: preset.modelId,
        doGenerate: async () => ({
            content: [{ type: 'text' as const, text: 'ok' }],
            finishReason: { unified: 'stop' as const, raw: undefined },
            usage,
            warnings: [],
        }),
        doStream: async () => ({
            stream: new ReadableStream({
                start(controller) {
                    controller.enqueue({
                        type: 'finish',
                        finishReason: { unified: 'stop', raw: undefined },
                        usage,
                    });
                    controller.close();
                },
            }),
        }),
    });

describe('getGoogleGeminiModel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGoogleInteractions.mockReturnValue(createMockModel());
    });

    it('constructs the Interactions model with explicit credentials and gateway settings', () => {
        getGoogleGeminiModel(
            {
                apiKey: 'fake-gemini-key',
                modelName: preset.name,
                baseUrl: 'https://gateway.example/google/v1beta',
                availableModels: [],
                supportsStreaming: true,
            },
            preset,
        );

        expect(createGoogleGenerativeAI).toHaveBeenCalledWith({
            apiKey: 'fake-gemini-key',
            baseURL: 'https://gateway.example/google/v1beta',
        });
        expect(mockGoogleInteractions).toHaveBeenCalledWith('gemini-3.8-flash');
    });

    it('sets Gemini reasoning and retention options', () => {
        const reasoning = getGoogleGeminiModel(
            {
                apiKey: 'fake-gemini-key',
                modelName: preset.name,
                availableModels: [],
                supportsStreaming: true,
            },
            preset,
            { enableReasoning: true },
        );
        const withoutReasoning = getGoogleGeminiModel(
            {
                apiKey: 'fake-gemini-key',
                modelName: preset.name,
                availableModels: [],
                supportsStreaming: true,
            },
            preset,
        );

        expect(reasoning.providerOptions).toEqual({
            google: {
                store: false,
                thinkingLevel: 'medium',
                thinkingSummaries: 'auto',
            },
        });
        expect(withoutReasoning.providerOptions).toEqual({
            google: { store: false, thinkingLevel: 'low' },
        });
    });

    it('enforces store false for generate calls while preserving provider options', async () => {
        const mockModel = createMockModel();
        const model = withGoogleInteractionsDefaults(mockModel);

        await generateText({
            model,
            prompt: 'Hello',
            providerOptions: {
                google: { store: true, thinkingLevel: 'high' },
                openai: { marker: 1 },
            },
        });

        expect(mockModel.doGenerateCalls[0]?.providerOptions).toEqual({
            openai: { marker: 1 },
            google: { store: false, thinkingLevel: 'high' },
        });
    });

    it('enforces store false for stream calls while preserving provider options', async () => {
        const mockModel = createMockModel();
        const model = withGoogleInteractionsDefaults(mockModel);

        await streamText({
            model,
            prompt: 'Hello',
            providerOptions: {
                google: { store: true, thinkingLevel: 'high' },
                openai: { marker: 1 },
            },
        }).consumeStream();

        expect(mockModel.doStreamCalls[0]?.providerOptions).toEqual({
            openai: { marker: 1 },
            google: { store: false, thinkingLevel: 'high' },
        });
    });
});
