import { createOpenAI, OpenAIProviderSettings } from '@ai-sdk/openai';

export const getOpenaiGptmodel = (
    modelName: string,
    settings: Pick<OpenAIProviderSettings, 'apiKey'> &
        Partial<OpenAIProviderSettings> = {},
) => {
    const openai = createOpenAI({
        ...settings,
        compatibility: 'strict',
    });

    const model = openai(modelName, {
        structuredOutputs: true,
    });

    return model;
};
