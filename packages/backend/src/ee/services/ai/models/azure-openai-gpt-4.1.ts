import { AzureOpenAIProvider, createAzure } from '@ai-sdk/azure';
import { LightdashConfig } from '../../../../config/parseConfig';
import { AiModel } from './types';

const PROVIDER = 'azure';

export const getAzureProvider = (
    config: NonNullable<LightdashConfig['ai']['copilot']['providers']['azure']>,
): AzureOpenAIProvider =>
    createAzure({
        apiKey: config.apiKey,
        baseURL: config.endpoint,
        apiVersion: config.apiVersion,
        useDeploymentBasedUrls: config.useDeploymentBasedUrls,
    });

export const getAzureGpt41Model = (
    config: NonNullable<LightdashConfig['ai']['copilot']['providers']['azure']>,
): AiModel<typeof PROVIDER> => {
    const azure = getAzureProvider(config);

    const model = azure(config.deploymentName);

    return {
        model,
        callOptions: {
            temperature: 0.2,
        },
        providerOptions: {
            [PROVIDER]: {
                strictJsonSchema: true,
            },
        },
    };
};
