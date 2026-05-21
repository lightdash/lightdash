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
                contextManagement: {
                    edits: [
                        ...(reasoningEnabled
                            ? [{ type: 'clear_thinking_20251015' as const }]
                            : []),
                        {
                            type: 'clear_tool_uses_20250919',
                            trigger: {
                                type: 'input_tokens',
                                value: 120_000,
                            },
                            keep: { type: 'tool_uses', value: 3 },
                            clearAtLeast: {
                                type: 'input_tokens',
                                value: 5_000,
                            },
                        },
                    ],
                },
                ...(reasoningEnabled &&
                    (reasoningStyle === 'adaptive'
                        ? {
                              // Claude Opus 4.7 (and newer adaptive-thinking
                              // models) reject `thinking.type: 'enabled'` and
                              // require `thinking.type: 'adaptive'` paired with
                              // `output_config.effort`. The `clear_thinking_20251015`
                              // context-management edit added above also
                              // requires a `thinking` field on the request, so
                              // we MUST set adaptive here — sending neither, or
                              // sending enabled, both produce a 400.
                              // @ai-sdk/anthropic exposes the adaptive variant
                              // from 3.0.62+.
                              effort: 'medium' as const,
                              thinking: { type: 'adaptive' as const },
                          }
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
