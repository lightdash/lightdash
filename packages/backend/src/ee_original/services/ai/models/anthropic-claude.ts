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
    options?: { enableReasoning?: boolean },
): AiModel<typeof PROVIDER> => {
    const anthropic = createAnthropic({
        apiKey: config.apiKey,
    });

    const model = anthropic(preset.modelId);

    const reasoningEnabled =
        options?.enableReasoning && preset.supportsReasoning;

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
                ...(reasoningEnabled && {
                    thinking: {
                        type: 'enabled',
                        /** @ref https://platform.claude.com/docs/en/build-with-claude/extended-thinking#working-with-thinking-budgets */
                        budgetTokens: 2048,
                    },
                }),
            },
        },
    };
};
