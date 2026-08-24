import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { getBedrockModelPrefix, getBedrockProvider } from './bedrock';

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
