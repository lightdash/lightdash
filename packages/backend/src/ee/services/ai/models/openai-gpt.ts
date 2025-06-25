import { createOpenAI } from '@ai-sdk/openai';
import { LightdashConfig } from '../../../../config/parseConfig';

export const getOpenaiGptmodel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['openai']
    >,
) => {
    const openai = createOpenAI({
        apiKey: config.apiKey,
        compatibility: 'strict',
        ...(config.baseUrl
            ? { baseURL: config.baseUrl, compatibility: 'compatible' }
            : {}),
    });

    const model = openai(config.modelName, {
        structuredOutputs: true,
    });

    return model;
};
