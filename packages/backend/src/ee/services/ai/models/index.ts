import {
    AIModelOption,
    assertUnreachable,
    ParameterError,
} from '@lightdash/common';
import { LightdashConfig } from '../../../../config/parseConfig';
import { getAnthropicModel } from './anthropic-claude';
import { getAzureGpt41Model } from './azure-openai-gpt-4.1';
import { getBedrockModel } from './bedrock';
import { getOpenaiGptmodel } from './openai-gpt';
import { getOpenRouterModel } from './openrouter';
import { MODEL_PRESETS, ModelPreset } from './presets';

export { MODEL_PRESETS };

export const getDefaultModel = (
    config: LightdashConfig['ai']['copilot'],
): {
    modelId: string;
    provider: typeof config.defaultProvider;
} => {
    switch (config.defaultProvider) {
        case 'azure': {
            const azureConfig = config.providers.azure;
            if (!azureConfig) {
                throw new ParameterError('Azure configuration is required');
            }

            return {
                modelId: azureConfig.deploymentName,
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
                modelId: defaultProvider.modelName,
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

        const providerPresets = Object.values(MODEL_PRESETS).filter(
            (preset) => preset.provider === provider,
        );

        // Filter by availableModels if specified, otherwise include all
        const filteredPresets =
            availableModels && availableModels.length > 0
                ? providerPresets.filter((preset) =>
                      availableModels.includes(preset.modelId),
                  )
                : providerPresets;

        return filteredPresets;
    });
};

export const getModelPreset = <T extends 'openai' | 'anthropic' | 'bedrock'>(
    provider: T,
    config: LightdashConfig['ai']['copilot'],
    modelId?: string,
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

    // TODO :: for now we just use default model to preserve current behavior
    const preset = getAvailableModels(config).find(
        (m) => m.modelId === (modelId ?? providerConfig.modelName),
    );
    if (!preset) {
        throw new ParameterError(
            `Model preset not found for model: ${modelId}`,
        );
    }
    if (preset.provider !== provider) {
        throw new ParameterError(`Model ${modelId} is not a ${provider} model`);
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
        modelId?: string;
        provider?: typeof config.defaultProvider;
    },
) => {
    const provider = options?.provider ?? config.defaultProvider;
    switch (provider) {
        case 'openai': {
            const { config: openaiConfig, preset } = getModelPreset(
                'openai',
                config,
                options?.modelId,
            );
            return getOpenaiGptmodel(openaiConfig, preset);
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
                options?.modelId,
            );
            return getAnthropicModel(anthropicConfig, preset);
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
                options?.modelId,
            );
            return getBedrockModel(bedrockConfig, preset);
        }
        default:
            return assertUnreachable(provider, `Invalid provider: ${provider}`);
    }
};
