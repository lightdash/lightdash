import { createOpenAI } from '@ai-sdk/openai';
import { LightdashConfig } from '../../../../config/parseConfig';
import { ModelPreset } from './presets';
import { AiModel } from './types';

const PROVIDER = 'openai';

export const getOpenaiGptmodel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['openai']
    >,
    preset: ModelPreset<'openai'>,
    options?: { enableReasoning?: boolean },
): AiModel<typeof PROVIDER> => {
    const openai = createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const { supportsReasoning, modelId } = preset;

    const model = openai(modelId);

    const reasoningEnabled = supportsReasoning;
    const reasoningEffort = options?.enableReasoning ? 'medium' : 'low';

    return {
        model,
        callOptions: {
            ...preset.callOptions,
            // temperature is not supported when reasoning is enabled
            ...(reasoningEnabled
                ? { temperature: undefined }
                : { temperature: 0.2 }),
        },
        providerOptions: {
            [PROVIDER]: {
                ...(preset.providerOptions || {}),
                // Defaulting to Low as GPT-5 models without reasoning are not better than GPT-4.1
                ...(reasoningEnabled && {
                    reasoningSummary: 'auto',
                    reasoningEffort,
                }),
            },
        },
    };
};
