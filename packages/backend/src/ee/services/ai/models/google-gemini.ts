import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { LightdashConfig } from '../../../../config/parseConfig';
import { AiModel } from './types';

const PROVIDER = 'gemini';

export const getGeminiModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['gemini']
    >,
): AiModel<typeof PROVIDER> => {
    const google = createGoogleGenerativeAI({
        apiKey: config.apiKey,
    });

    const model = google(config.modelName);

    return {
        model,
        callOptions: {
            temperature: 0.2,
        },
        providerOptions: undefined,
    };
};
