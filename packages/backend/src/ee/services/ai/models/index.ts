import { assertUnreachable, ParameterError } from '@lightdash/common';
import { LightdashConfig } from '../../../../config/parseConfig';
import { getAnthropicModel } from './anthropic-claude';
import { getAzureGpt41Model } from './azure-openai-gpt-4.1';
import { getBedrockModel } from './bedrock';
import { getOpenaiGptmodel } from './openai-gpt';
import { getOpenRouterModel } from './openrouter';
import { MODEL_PRESETS, ModelPreset } from './presets';

const getModelPreset = <T extends 'openai' | 'anthropic' | 'bedrock'>(
    provider: T,
    config: LightdashConfig['ai']['copilot'],
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
    const modelId = providerConfig.modelName;
    const preset = MODEL_PRESETS[modelId];
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
        provider?: 'openai' | 'anthropic' | 'bedrock' | 'azure' | 'openrouter';
    },
) => {
    const provider = options?.provider ?? config.defaultProvider;
    switch (provider) {
        case 'openai': {
            const { config: openaiConfig, preset } = getModelPreset(
                'openai',
                config,
            );
            return getOpenaiGptmodel(openaiConfig, preset, options);
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
            );
            return getBedrockModel(bedrockConfig, preset);
        }
        default:
            return assertUnreachable(provider, `Invalid provider: ${provider}`);
    }
};
