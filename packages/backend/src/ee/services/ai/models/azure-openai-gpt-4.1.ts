import { AzureOpenAIProvider, createAzure } from '@ai-sdk/azure';
import { LightdashConfig } from '../../../../config/parseConfig';
import {
    getReasoningProviderOptions,
    withChatCompletionsDefaults,
} from './chatCompletions';
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
        headers: config.customHeaders,
    });

export const getAzureGpt41Model = (
    config: NonNullable<LightdashConfig['ai']['copilot']['providers']['azure']>,
): AiModel<typeof PROVIDER> => {
    const azure = getAzureProvider(config);

    const model = config.useChatCompletions
        ? withChatCompletionsDefaults(azure.chat(config.deploymentName))
        : azure(config.deploymentName);

    const reasoningEnabled = config.deploymentSupportsReasoning;

    return {
        model,
        callOptions: {
            ...(reasoningEnabled
                ? { temperature: undefined }
                : { temperature: 0.2 }),
        },
        providerOptions: {
            // @ts-expect-error - provider should be set to openai for azure
            openai: {
                // strictJsonSchema: provider default is true
                ...(reasoningEnabled &&
                    getReasoningProviderOptions({
                        useChatCompletions: config.useChatCompletions,
                        responsesEffort: 'medium',
                        includeSummary: true,
                    })),
            },
        },
    };
};
