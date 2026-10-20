import { AzureOpenAIProvider, createAzure } from '@ai-sdk/azure';
import { wrapLanguageModel } from 'ai';
import { LightdashConfig } from '../../../../config/parseConfig';
import { dropParallelToolCallsWithoutTools } from './chatCompletionsMiddleware';
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
        ? wrapLanguageModel({
              model: azure.chat(config.deploymentName),
              middleware: dropParallelToolCallsWithoutTools,
          })
        : azure(config.deploymentName);

    const reasoningEnabled = config.deploymentSupportsReasoning;
    // Chat Completions rejects function tools on reasoning deployments unless
    // reasoning is explicitly disabled.
    const reasoningEffort = config.useChatCompletions ? 'none' : 'medium';

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
                ...(reasoningEnabled && {
                    reasoningEffort,
                    ...(!config.useChatCompletions && {
                        reasoningSummary: 'auto',
                    }),
                }),
            },
        },
    };
};
