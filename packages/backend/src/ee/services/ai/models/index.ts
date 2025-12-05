import { assertUnreachable, ParameterError } from '@lightdash/common';
import { LightdashConfig } from '../../../../config/parseConfig';
import { getAnthropicModel } from './anthropic-claude';
import { getAzureGpt41Model } from './azure-openai-gpt-4.1';
import { getBedrockModel } from './bedrock';
import { getOpenaiGptmodel } from './openai-gpt';
import { getOpenRouterModel } from './openrouter';
import { matchesPreset, MODEL_PRESETS, ModelPreset } from './presets';

export { MODEL_PRESETS };

export const getDefaultModel = (
    config: LightdashConfig['ai']['copilot'],
): {
    name: string;
    provider: typeof config.defaultProvider;
} => {
    switch (config.defaultProvider) {
        case 'azure': {
            const azureConfig = config.providers.azure;
            if (!azureConfig) {
                throw new ParameterError('Azure configuration is required');
            }

            return {
                name: azureConfig.deploymentName,
                provider: 'azure',
            };
        }
        default: {
            const defaultProvider = config.providers[config.defaultProvider];
            if (!defaultProvider) {
                throw new ParameterError(
                    `Default provider ${config.defaultProvider} not found`,
                );
            }
            return {
                name: defaultProvider.modelName,
                provider: config.defaultProvider,
            };
        }
    }
};

export const getAvailableModels = (
    config: LightdashConfig['ai']['copilot'],
): ModelPreset<'openai' | 'anthropic' | 'bedrock'>[] => {
    const { defaultProvider, providers } = config;

    if (['azure', 'openrouter'].includes(defaultProvider)) {
        return [];
    }

    const configuredProviders = ['openai', 'anthropic', 'bedrock'] as const;

    return configuredProviders.flatMap((provider) => {
        const providerConfig = providers[provider];
        if (!providerConfig) return [];

        const { availableModels, modelName } = providerConfig;

        const providerPresets = MODEL_PRESETS[provider];

        // Filter by availableModels if specified, otherwise include all
        const filteredPresets =
            availableModels && availableModels.length > 0
                ? providerPresets.filter((preset) =>
                      availableModels.some((model) =>
                          matchesPreset(preset, model),
                      ),
                  )
                : providerPresets;

        return filteredPresets;
    });
};

export const getModelPreset = <T extends 'openai' | 'anthropic' | 'bedrock'>(
    provider: T,
    config: LightdashConfig['ai']['copilot'],
    modelName?: string,
): {
    config: NonNullable<LightdashConfig['ai']['copilot']['providers'][T]>;
    preset: ModelPreset<T>;
} => {
    const providerConfig = config.providers[provider];
    if (!providerConfig) {
        throw new ParameterError(
            `${provider} provider configuration is required`,
        );
    }

    const modelNameToFind = modelName ?? providerConfig.modelName;
    const preset = getAvailableModels(config).find(
        (p) => p.provider === provider && matchesPreset(p, modelNameToFind),
    );
    if (!preset) {
        throw new ParameterError(
            `Model preset not found for model: ${modelNameToFind}`,
        );
    }

    return {
        config: providerConfig,
        preset: preset as ModelPreset<T>,
    };
};

export const getModel = (
    config: LightdashConfig['ai']['copilot'],
    options?: {
        enableReasoning?: boolean;
        modelName?: string;
        provider?: typeof config.defaultProvider;
    },
) => {
    const provider = options?.provider ?? config.defaultProvider;
    switch (provider) {
        case 'openai': {
            const { config: openaiConfig, preset } = getModelPreset(
                'openai',
                config,
                options?.modelName,
            );
            return getOpenaiGptmodel(openaiConfig, preset, {
                enableReasoning: options?.enableReasoning,
            });
        }
        case 'azure': {
            const azureConfig = config.providers.azure;
            if (!azureConfig) {
                throw new ParameterError('Azure configuration is required');
            }
            // Azure doesn't use presets - uses deployment name directly
            return getAzureGpt41Model(azureConfig);
        }
        case 'anthropic': {
            const { config: anthropicConfig, preset } = getModelPreset(
                'anthropic',
                config,
                options?.modelName,
            );
            return getAnthropicModel(anthropicConfig, preset, {
                enableReasoning: options?.enableReasoning,
            });
        }
        case 'openrouter': {
            const openrouterConfig = config.providers.openrouter;
            if (!openrouterConfig) {
                throw new ParameterError(
                    'OpenRouter configuration is required',
                );
            }
            // OpenRouter doesn't use presets - uses model name directly
            return getOpenRouterModel(openrouterConfig);
        }
        case 'bedrock': {
            const { config: bedrockConfig, preset } = getModelPreset(
                'bedrock',
                config,
                options?.modelName,
            );
            return getBedrockModel(bedrockConfig, preset, {
                enableReasoning: options?.enableReasoning,
            });
        }
        default:
            return assertUnreachable(provider, `Invalid provider: ${provider}`);
    }
};
