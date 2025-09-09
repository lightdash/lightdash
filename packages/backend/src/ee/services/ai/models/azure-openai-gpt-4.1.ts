import { createAzure } from '@ai-sdk/azure';
import { OpenAISchemaCompatLayer } from '@mastra/schema-compat';
import { LightdashConfig } from '../../../../config/parseConfig';
import { AiModel } from './types';

const PROVIDER = 'azure';

export const getAzureGpt41Model = (
    config: NonNullable<LightdashConfig['ai']['copilot']['providers']['azure']>,
): AiModel<typeof PROVIDER> => {
    const azure = createAzure({
        apiKey: config.apiKey,
        baseURL: config.endpoint,
        apiVersion: config.apiVersion,
    });

    const model = azure(config.deploymentName);

    const schemaCompatLayer = new OpenAISchemaCompatLayer({
        modelId: config.deploymentName,
        provider: PROVIDER,
        supportsStructuredOutputs: true,
    });

    return {
        model,
        callOptions: {
            temperature: config.temperature,
        },
        schemaCompatibilityLayers: [schemaCompatLayer],
        providerOptions: {
            [PROVIDER]: {
                strictJsonSchema: true,
            },
        },
    };
};
