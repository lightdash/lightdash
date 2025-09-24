import { createAzure } from '@ai-sdk/azure';
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

    return {
        model,
        callOptions: {
            temperature: config.temperature,
        },
        providerOptions: {
            [PROVIDER]: {
                strictJsonSchema: true,
            },
        },
    };
};
