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
        providerOptions: {
            [PROVIDER]: {
                ...(preset.providerOptions || {}),
                // TODO :: reasoning
                // ...(preset.supportsReasoning && {
                //     thinking: {
                //         type: 'enabled',
                //         /** @ref https://platform.claude.com/docs/en/build-with-claude/extended-thinking#working-with-thinking-budgets */
                //         budgetTokens: 1024, // TODO :: low - 1024, medium - 4096, high - 16384
                //     },
                // }),
            },
        },
    };
};
