import { createAnthropic } from '@ai-sdk/anthropic';
import { getAnthropicModel } from './anthropic-claude';
import type { ModelPreset } from './presets';

vi.mock('@ai-sdk/anthropic', () => ({
    createAnthropic: vi.fn(() => vi.fn(() => ({}))),
}));

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
