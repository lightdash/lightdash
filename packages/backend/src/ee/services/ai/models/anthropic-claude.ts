import { createAnthropic } from '@ai-sdk/anthropic';
import { AnthropicSchemaCompatLayer } from '@mastra/schema-compat';
import { LightdashConfig } from '../../../../config/parseConfig';
import { AiModel } from './types';

const PROVIDER = 'anthropic';

export const getAnthropicModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['anthropic']
    >,
): AiModel<typeof PROVIDER> => {
    const anthropic = createAnthropic({
        apiKey: config.apiKey,
    });

    const model = anthropic(config.modelName);

    const schemaCompatLayer = new AnthropicSchemaCompatLayer({
        modelId: config.modelName,
        provider: 'anthropic',
        supportsStructuredOutputs: false,
    });

    return {
        model,
        schemaCompatibilityLayers: [schemaCompatLayer],
        callOptions: {
            temperature: config.temperature,
        },
        providerOptions: undefined,
    };
};
