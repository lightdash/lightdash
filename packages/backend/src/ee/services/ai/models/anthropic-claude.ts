import { AnthropicProviderSettings, createAnthropic } from '@ai-sdk/anthropic';

export const getAnthropicModel = (
    modelName: string,
    settings: Pick<AnthropicProviderSettings, 'apiKey'> &
        Partial<AnthropicProviderSettings> = {},
) => {
    const anthropic = createAnthropic({
        ...settings,
    });

    const model = anthropic(modelName);

    return model;
};
