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
    options?: {
        enableReasoning?: boolean;
    },
): AiModel<typeof PROVIDER> => {
    const openai = createOpenAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });

    const model = openai(preset.modelId);

    const isGpt5 = model.modelId.includes('gpt-5');

    // Determine if reasoning should be enabled
    const reasoningEnabled =
        preset.supportsReasoning &&
        (options?.enableReasoning !== undefined
            ? options.enableReasoning
            : false);

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
                ...(reasoningEnabled && {
                    reasoningSummary: 'auto',
                    reasoningEffort: 'medium',
                }),
            },
        },
    };
};
