import { createOpenAI } from '@ai-sdk/openai';
import { LightdashConfig } from '../../../../config/parseConfig';
import { AiModel } from './types';

const PROVIDER = 'openai';

export const getOpenaiGptmodel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['openai']
    >,
): AiModel<typeof PROVIDER> => {
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
        providerOptions: {
            [PROVIDER]: {
                strictJsonSchema: true,
            },
        },
    };
};
