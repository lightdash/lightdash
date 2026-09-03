import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { LightdashConfig } from '../../../../config/parseConfig';
import { ModelPreset } from './presets';
import { AiModel, ProviderOptionsMap } from './types';

const PROVIDER = 'google';

export const getGoogleGeminiModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['google']
    >,
    preset: ModelPreset<'google'>,
    options?: { enableReasoning?: boolean },
): AiModel<typeof PROVIDER> => {
    const google = createGoogleGenerativeAI({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    const reasoningEnabled =
        options?.enableReasoning === true && preset.supportsReasoning;
    const providerOptions = {
        ...(preset.providerOptions ?? {}),
        thinkingLevel: reasoningEnabled ? 'medium' : 'low',
        ...(reasoningEnabled ? { thinkingSummaries: 'auto' } : {}),
    } satisfies ProviderOptionsMap[typeof PROVIDER];

    return {
        model: google.interactions(preset.modelId),
        callOptions: preset.callOptions,
        providerOptions: { [PROVIDER]: providerOptions },
    };
};
