import { createOpenAI } from '@ai-sdk/openai';
import { LightdashConfig } from '../../../../config/parseConfig';

export const getOpenaiGptmodel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['openai']
    >,
) => {
    const openai = createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });

    const model = openai(config.modelName);

    return {
        model,
        callOptions: {
            temperature: config.temperature,
        },
    };
};
