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

    const reasoningStyle = preset.reasoningStyle ?? 'budget';

    return {
        model,
        callOptions: {
            ...preset.callOptions,
            ...(reasoningEnabled && { temperature: undefined }),
        },
        providerOptions: {
            [PROVIDER]: {
                ...(preset.providerOptions || {}),
                ...(reasoningEnabled &&
                    (reasoningStyle === 'adaptive'
                        ? { effort: 'medium' as const }
                        : {
                              thinking: {
                                  type: 'enabled' as const,
                                  /** @ref https://platform.claude.com/docs/en/build-with-claude/extended-thinking#working-with-thinking-budgets */
                                  budgetTokens: 2048,
                              },
                          })),
            },
        },
    };
};
