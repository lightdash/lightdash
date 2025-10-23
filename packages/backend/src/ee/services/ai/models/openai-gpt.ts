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

    // TODO: Use config.responsesApi to determine if we should use the responses API.
    const model = openai(config.modelName);

    const isGpt5 = model.modelId.includes('gpt-5');

    return {
        model,
        callOptions: {
            ...(!isGpt5 && {
                // gpt-5 models don't support temperature
                temperature: config.temperature,
            }),
        },
        providerOptions: {
            [PROVIDER]: {
                strictJsonSchema: true,
                parallelToolCalls: false,
                reasoningEffort: 'high',
                textVerbosity: 'medium',
            },
        },
    };
};
