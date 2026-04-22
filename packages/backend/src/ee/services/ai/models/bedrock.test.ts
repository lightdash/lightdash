import { getBedrockModelPrefix } from './bedrock';

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
