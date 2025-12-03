import { createAnthropic } from '@ai-sdk/anthropic';
import { LightdashConfig } from '../../../../config/parseConfig';
import { ModelPreset } from './presets';
import { AiModel } from './types';

const PROVIDER = 'anthropic';

export const getAnthropicModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['anthropic']
    >,
    preset: ModelPreset<'anthropic'>,
): AiModel<typeof PROVIDER> => {
    const anthropic = createAnthropic({
        apiKey: config.apiKey,
    });

    const model = anthropic(preset.modelId);

    return {
        model,
        callOptions: preset.callOptions,
        providerOptions: preset.providerOptions
            ? { [PROVIDER]: preset.providerOptions }
            : undefined,
    };
};
