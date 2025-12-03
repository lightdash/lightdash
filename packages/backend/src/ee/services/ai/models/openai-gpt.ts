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
): AiModel<typeof PROVIDER> => {
    const openai = createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });

    const model = openai(preset.modelId);

    const isGpt5 = model.modelId.includes('gpt-5');

    const reasoningEnabled = preset.supportsReasoning;

    return {
        model,
        callOptions: {
            ...(!isGpt5 && {
                // gpt-5 models don't support temperature
                temperature: preset.callOptions.temperature,
            }),
        },
        providerOptions: {
            [PROVIDER]: {
                ...(preset.providerOptions || {}),
                // TODO :: reasoning
                // Defaulting to Low as GPT-5 models without reasoning are not better than GPT-4.1
                ...(reasoningEnabled && {
                    reasoningSummary: 'auto',
                    reasoningEffort: 'low',
                }),
            },
        },
    };
};
