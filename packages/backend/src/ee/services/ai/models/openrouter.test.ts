import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { getOpenRouterModel } from './openrouter';

vi.mock('@openrouter/ai-sdk-provider', () => ({
    createOpenRouter: vi.fn(() => ({ chat: vi.fn(() => ({})) })),
}));

const baseConfig = {
    apiKey: 'openrouter-key',
    modelName: 'moonshotai/kimi-k3',
    sortOrder: 'latency' as const,
    allowedProviders: [],
    providerOrder: [],
    customHeaders: {},
    supportsStreaming: true,
};

const routingBlock = () =>
    vi.mocked(createOpenRouter).mock.calls[0][0]?.extraBody?.provider;

describe('getOpenRouterModel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('routes freely when no upstream provider is configured', () => {
        getOpenRouterModel(baseConfig);

        expect(routingBlock()).toEqual({
            data_collection: 'deny',
            require_parameters: true,
        });
    });

    test('pins upstream providers with an `only` filter', () => {
        getOpenRouterModel({
            ...baseConfig,
            allowedProviders: ['deepinfra', 'baseten'],
        });

        expect(routingBlock()).toMatchObject({
            only: ['deepinfra', 'baseten'],
        });
        expect(routingBlock()).not.toHaveProperty('order');
    });

    test('prefers upstream providers with an `order` list that keeps fallbacks', () => {
        getOpenRouterModel({ ...baseConfig, providerOrder: ['deepinfra'] });

        expect(routingBlock()).toMatchObject({ order: ['deepinfra'] });
        expect(routingBlock()).not.toHaveProperty('only');
    });
});
