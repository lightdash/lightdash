import { createAnthropic } from '@ai-sdk/anthropic';
import { LightdashConfig } from '../../../../config/parseConfig';
import { AiModel } from './types';

const PROVIDER = 'anthropic';

export const getAnthropicModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['anthropic']
    >,
    options?: {
        enableReasoning?: boolean;
    },
): AiModel<typeof PROVIDER> => {
    const anthropic = createAnthropic({
        apiKey: config.apiKey,
    });

    // Use agent-specific enableReasoning if provided, otherwise fall back to config
    const reasoningEnabled =
        options?.enableReasoning !== undefined
            ? options.enableReasoning
            : config.reasoning.enabled;

    const model = anthropic(config.modelName);

    return {
        model,
        callOptions: {
            temperature: config.temperature,
        },
        providerOptions: {
            [PROVIDER]: {
                ...(reasoningEnabled && {
                    thinking: {
                        type: 'enabled',
                        budgetTokens: config.reasoning.budgetTokens,
                    },
                }),
            },
        },
    };
};
