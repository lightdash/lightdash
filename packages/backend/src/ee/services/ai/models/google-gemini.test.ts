import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { getGoogleGeminiModel } from './google-gemini';
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

const mockModel = { modelId: preset.modelId };

describe('getGoogleGeminiModel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGoogleInteractions.mockReturnValue(mockModel);
    });

    it('constructs the Interactions model with explicit credentials and gateway settings', () => {
        const result = getGoogleGeminiModel(
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
        expect(result.model).toBe(mockModel);
    });

    it('sets Gemini reasoning options', () => {
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
                thinkingLevel: 'medium',
                thinkingSummaries: 'auto',
            },
        });
        expect(withoutReasoning.providerOptions).toEqual({
            google: { thinkingLevel: 'low' },
        });
    });
});
