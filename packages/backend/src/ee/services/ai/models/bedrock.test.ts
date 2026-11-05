import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import {
    getBedrockModel,
    getBedrockModelPrefix,
    getBedrockProvider,
} from './bedrock';
import { BEDROCK_MAX_OUTPUT_TOKENS, MODEL_PRESETS } from './presets';

vi.mock('@ai-sdk/amazon-bedrock', () => ({
    createAmazonBedrock: vi.fn(),
}));

vi.mock('@aws-sdk/credential-providers', () => ({
    fromNodeProviderChain: vi.fn(() => vi.fn()),
}));

describe('getBedrockModelPrefix', () => {
    test('uses the explicit override prefix when provided', () => {
        expect(getBedrockModelPrefix('ap-northeast-1', 'jp')).toBe('jp');
    });

    test('keeps apac for AP regions by default', () => {
        expect(getBedrockModelPrefix('ap-northeast-1')).toBe('apac');
    });

    test('keeps existing us and eu mappings', () => {
        expect(getBedrockModelPrefix('us-east-1')).toBe('us');
        expect(getBedrockModelPrefix('eu-west-1')).toBe('eu');
    });
});

describe('getBedrockProvider', () => {
    const baseConfig = {
        region: 'us-east-1',
        modelName: 'model',
        embeddingModelName: 'embedding-model',
        customHeaders: {},
        inferenceProfilePrefix: undefined,
        supportsStreaming: true,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('passes the API key and custom base URL when configured', () => {
        getBedrockProvider({
            ...baseConfig,
            apiKey: 'key',
            baseUrl: 'https://bedrock-gateway.example/runtime',
        });
        expect(createAmazonBedrock).toHaveBeenCalledWith(
            expect.objectContaining({
                apiKey: 'key',
                region: 'us-east-1',
                baseURL: 'https://bedrock-gateway.example/runtime',
            }),
        );
    });

    test('passes static keys when configured', () => {
        getBedrockProvider({
            ...baseConfig,
            accessKeyId: 'id',
            secretAccessKey: 'secret',
            sessionToken: undefined,
        });
        expect(createAmazonBedrock).toHaveBeenCalledWith(
            expect.objectContaining({
                accessKeyId: 'id',
                secretAccessKey: 'secret',
            }),
        );
    });

    test('resolves the AWS default credential chain when using default credentials', () => {
        getBedrockProvider({ ...baseConfig, useDefaultCredentials: true });
        expect(fromNodeProviderChain).toHaveBeenCalled();
        expect(createAmazonBedrock).toHaveBeenCalledWith(
            expect.objectContaining({
                region: 'us-east-1',
                credentialProvider: expect.any(Function),
            }),
        );
    });
});

describe('getBedrockModel output budget', () => {
    const preset = MODEL_PRESETS.bedrock.find(
        (candidate) => candidate.name === 'claude-opus-5-5',
    );
    if (!preset) throw new Error('Missing adaptive model preset');
    const config = {
        apiKey: 'test',
        region: 'us-east-1',
        modelName: preset.name,
        embeddingModelName: 'amazon.titan-embed-text-v2:0',
        customHeaders: {},
        supportsStreaming: true,
    };

    beforeEach(async () => {
        vi.clearAllMocks();
        const actual = await vi.importActual<
            typeof import('@ai-sdk/amazon-bedrock')
        >('@ai-sdk/amazon-bedrock');
        vi.mocked(createAmazonBedrock).mockImplementation(
            actual.createAmazonBedrock,
        );
    });

    test('sets an explicit output budget for adaptive reasoning at medium effort', () => {
        const { callOptions } = getBedrockModel(config, preset, {
            enableReasoning: true,
            reasoningEffort: 'medium',
        });
        expect(callOptions.maxOutputTokens).toBe(BEDROCK_MAX_OUTPUT_TOKENS);
    });

    test('preserves the xhigh output budget', () => {
        const { callOptions } = getBedrockModel(config, preset, {
            enableReasoning: true,
            reasoningEffort: 'xhigh',
        });
        expect(callOptions.maxOutputTokens).toBe(24_000);
    });

    test('uses the configured output cap before an adaptive preset cap', () => {
        const { callOptions } = getBedrockModel(
            { ...config, maxOutputTokens: 32_000 },
            {
                ...preset,
                callOptions: { ...preset.callOptions, maxOutputTokens: 48_000 },
            },
            { enableReasoning: true, reasoningEffort: 'medium' },
        );
        expect(callOptions.maxOutputTokens).toBe(32_000);
    });

    test('uses the configured output cap for budget reasoning at xhigh effort', () => {
        const budgetPreset = MODEL_PRESETS.bedrock.find(
            (candidate) => candidate.name === 'claude-haiku-4-5',
        );
        if (!budgetPreset) throw new Error('Missing budget model preset');
        const { callOptions } = getBedrockModel(
            {
                ...config,
                modelName: budgetPreset.name,
                maxOutputTokens: 32_000,
            },
            budgetPreset,
            { enableReasoning: true, reasoningEffort: 'xhigh' },
        );
        expect(callOptions.maxOutputTokens).toBe(32_000);
    });

    test('uses a preset output cap before the built-in default', () => {
        const { callOptions } = getBedrockModel(config, {
            ...preset,
            callOptions: { ...preset.callOptions, maxOutputTokens: 48_000 },
        });
        expect(callOptions.maxOutputTokens).toBe(48_000);
    });

    test('sets an explicit output cap even when reasoning is disabled', () => {
        const { callOptions } = getBedrockModel(config, preset, {
            enableReasoning: false,
        });
        expect(callOptions).toEqual({
            ...preset.callOptions,
            maxOutputTokens: BEDROCK_MAX_OUTPUT_TOKENS,
        });
    });
});
