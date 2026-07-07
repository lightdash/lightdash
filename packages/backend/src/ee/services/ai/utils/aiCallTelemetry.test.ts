import type { LanguageModel } from 'ai';
import { getLanguageModelAttribution } from './aiCallTelemetry';

const modelObject = (modelId: string, provider: string): LanguageModel =>
    ({ modelId, provider } as LanguageModel);

describe('getLanguageModelAttribution', () => {
    it('returns no provider for bare string models', () => {
        expect(getLanguageModelAttribution('gpt-4.1')).toEqual({
            model: 'gpt-4.1',
            provider: null,
        });
    });

    it('derives the configured provider name from a dot-namespaced provider id', () => {
        expect(
            getLanguageModelAttribution(modelObject('gpt-4.1', 'openai.chat')),
        ).toEqual({
            model: 'gpt-4.1',
            provider: 'openai',
        });
    });

    it('normalizes the bedrock SDK provider id to the configured name', () => {
        expect(
            getLanguageModelAttribution(
                modelObject(
                    'anthropic.claude-sonnet-4-20250514-v1:0',
                    'amazon-bedrock',
                ),
            ),
        ).toEqual({
            model: 'anthropic.claude-sonnet-4-20250514-v1:0',
            provider: 'bedrock',
        });
    });

    it('returns null provider for an empty provider string', () => {
        expect(getLanguageModelAttribution(modelObject('gpt-4.1', ''))).toEqual(
            {
                model: 'gpt-4.1',
                provider: null,
            },
        );
    });
});
