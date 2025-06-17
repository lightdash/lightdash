import { createAnthropic } from '@ai-sdk/anthropic';
import { LightdashConfig } from '../../../../config/parseConfig';

export const getAnthropicModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['anthropic']
    >,
) => {
    const anthropic = createAnthropic({
        apiKey: config.apiKey,
    });

    const model = anthropic(config.modelName);

    return model;
};
