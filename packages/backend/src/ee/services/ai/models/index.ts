import {
    assertUnreachable,
    isByoAiProvider,
    ParameterError,
    type AiModelOption,
    type AiOrgModelVisibility,
    type ByoAiProvider,
} from '@lightdash/common';
import { simulateStreamingMiddleware, wrapLanguageModel } from 'ai';
import { LightdashConfig } from '../../../../config/parseConfig';
import Logger from '../../../../logging/logger';
import { getAnthropicModel } from './anthropic-claude';
import { getAzureGpt41Model } from './azure-openai-gpt-4.1';
import { getBedrockModel } from './bedrock';
import { getOpenaiGptmodel } from './openai-gpt';
import { getOpenRouterModel } from './openrouter';
import {
    keyGrantsModel,
    matchesPreset,
    MODEL_PRESETS,
    ModelPreset,
    ModelPresetProvider,
} from './presets';
import { AiModel, AiProvider } from './types';

export { MODEL_PRESETS };

// Fast models for lightweight tasks (text generation, summaries, etc.)
// These are cheaper and faster than default models
const FAST_MODELS: Record<ModelPresetProvider, string> = {
    openai: 'gpt-5-mini',
    anthropic: 'claude-haiku-4-5',
    bedrock: 'claude-haiku-4-5',
};

// Picks the model an ambient/fast task should use on a BYO Anthropic key:
// the fast model when the key can serve it, otherwise the first shipped preset
// the key can access (e.g. an org whose key only unlocks claude-opus-4-8).
// A null accessible list means the models probe failed — fall back to the fast
// model optimistically and let the request itself surface any access error.
// Returns null only when the key can access no shipped Anthropic preset.
export const pickAmbientAnthropicPreset = (
    accessibleModelIds: string[] | null,
): ModelPreset<'anthropic'> | null => {
    const fast =
        MODEL_PRESETS.anthropic.find((preset) =>
            matchesPreset(preset, FAST_MODELS.anthropic),
        ) ?? null;
    if (accessibleModelIds === null) return fast;
    if (fast && keyGrantsModel(accessibleModelIds, fast.modelId)) return fast;
    return (
        MODEL_PRESETS.anthropic.find((preset) =>
            keyGrantsModel(accessibleModelIds, preset.modelId),
        ) ?? null
    );
};

// Returns null when the configured default provider isn't set up (e.g. the
// default `openai` provider with no OPENAI_API_KEY). Callers use this only to
// flag which preset is the default, so a missing provider should degrade to
// "no default" rather than throw — otherwise endpoints that list models (and
// the whole Settings page that depends on them) break for that config.
export const getDefaultModel = (
    config: LightdashConfig['ai']['copilot'],
): {
    name: string;
    provider: typeof config.defaultProvider;
} | null => {
    switch (config.defaultProvider) {
        case 'azure': {
            const azureConfig = config.providers.azure;
            if (!azureConfig) {
                Logger.warn(
                    'getDefaultModel: default AI provider is not configured',
                    { defaultProvider: 'azure' },
                );
                return null;
            }

            return {
                name: azureConfig.deploymentName,
                provider: 'azure',
            };
        }
        default: {
            const defaultProvider = config.providers[config.defaultProvider];
            if (!defaultProvider) {
                Logger.warn(
                    'getDefaultModel: default AI provider is not configured',
                    { defaultProvider: config.defaultProvider },
                );
                return null;
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

export const presetToModelOption = (
    preset: ModelPreset<'openai' | 'anthropic' | 'bedrock'>,
    defaultModel: { name: string; provider: string } | null,
): AiModelOption => ({
    name: preset.name,
    displayName: preset.displayName,
    description: preset.description,
    provider: preset.provider,
    default:
        defaultModel !== null &&
        preset.provider === defaultModel.provider &&
        matchesPreset(preset, defaultModel.name),
    supportsReasoning: preset.supportsReasoning,
});

export type OrgModelOverrides = {
    modelVisibility: AiOrgModelVisibility | null;
    // Model ids each org BYO key can access; missing/null = unknown → fail closed
    keyAccessibleModelIds: Partial<
        Record<ByoAiProvider, string[] | null>
    > | null;
};

/**
 * Org-level filter for model LISTINGS only — never applied in getModelPreset
 * resolution, so agents already configured with a hidden or disallowed model
 * keep working (grandfathered); they just can't be selected again.
 */
export const filterModelsForOrg = (
    presets: ModelPreset<'openai' | 'anthropic' | 'bedrock'>[],
    overrides: OrgModelOverrides,
): ModelPreset<'openai' | 'anthropic' | 'bedrock'>[] =>
    presets.filter((preset) => {
        // Only BYO-able providers can unlock hidden models or be restricted
        const byoProvider = isByoAiProvider(preset.provider)
            ? preset.provider
            : null;
        if (preset.hiddenUnlessKeyAccess) {
            const accessibleIds = byoProvider
                ? overrides.keyAccessibleModelIds?.[byoProvider]
                : null;
            if (
                !accessibleIds ||
                !keyGrantsModel(accessibleIds, preset.modelId)
            )
                return false;
        }
        if (!byoProvider) return true;
        const visibility = overrides.modelVisibility?.[byoProvider];
        if (!visibility) return true;
        if (!visibility.enabled) return false;
        if (visibility.allowedModels && visibility.allowedModels.length > 0) {
            return visibility.allowedModels.some((model) =>
                matchesPreset(preset, model),
            );
        }
        return true;
    });

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
    const availableModels = getAvailableModels(config);
    let preset = availableModels.find(
        (p) => p.provider === provider && matchesPreset(p, modelNameToFind),
    );

    // Fallback to first available model for provider if requested model not found
    // This handles deprecated models in env vars or stored in conversations
    if (!preset) {
        const fallbackPreset = availableModels.find(
            (p) => p.provider === provider,
        );
        if (!fallbackPreset) {
            throw new ParameterError(
                `No model presets available for provider: ${provider}`,
            );
        }
        Logger.warn(
            `Model preset not found for "${modelNameToFind}", falling back to "${fallbackPreset.name}"`,
        );
        preset = fallbackPreset;
    }

    return {
        config: providerConfig,
        preset: preset as ModelPreset<T>,
    };
};

/**
 * Some LLM gateways don't support streaming (SSE) completions. When a provider
 * is marked `supportsStreaming: false`, wrap its model with the AI SDK's
 * simulateStreamingMiddleware: `streamText` then issues a single non-streaming
 * `doGenerate` request per step and replays the result as a simulated stream,
 * so call sites (and the browser-facing SSE endpoint) are unaffected.
 */
export const applyStreamingCapability = <P extends AiProvider>(
    modelProperties: AiModel<P>,
    supportsStreaming: boolean,
): AiModel<P> => {
    if (supportsStreaming) {
        return modelProperties;
    }
    const { model } = modelProperties;
    if (model.specificationVersion !== 'v3') {
        throw new ParameterError(
            `Provider model "${model.modelId}" does not support disabling streaming`,
        );
    }
    Logger.debug(
        `Provider does not support streaming: serving "${model.modelId}" calls as non-streaming requests via simulated streaming`,
    );
    return {
        ...modelProperties,
        model: wrapLanguageModel({
            model,
            middleware: simulateStreamingMiddleware(),
        }),
    };
};

export const getModel = (
    config: LightdashConfig['ai']['copilot'],
    options?: {
        enableReasoning?: boolean;
        modelName?: string;
        provider?: typeof config.defaultProvider;
        /**
         * Use a fast, cost-effective model for lightweight tasks
         * (text generation, summaries, simple structured output)
         */
        useFastModel?: boolean;
    },
) => {
    const provider = options?.provider ?? config.defaultProvider;

    // Resolve model name: explicit > fast > default
    const resolveModelName = (
        providerKey: ModelPresetProvider,
    ): string | undefined =>
        options?.modelName ??
        (options?.useFastModel ? FAST_MODELS[providerKey] : undefined);

    switch (provider) {
        case 'openai': {
            const { config: openaiConfig, preset } = getModelPreset(
                'openai',
                config,
                resolveModelName('openai'),
            );
            return applyStreamingCapability(
                getOpenaiGptmodel(openaiConfig, preset, {
                    enableReasoning: options?.enableReasoning,
                }),
                openaiConfig.supportsStreaming,
            );
        }
        case 'azure': {
            const azureConfig = config.providers.azure;
            if (!azureConfig) {
                throw new ParameterError('Azure configuration is required');
            }
            // Azure doesn't use presets - uses deployment name directly
            return applyStreamingCapability(
                getAzureGpt41Model(azureConfig),
                azureConfig.supportsStreaming,
            );
        }
        case 'anthropic': {
            const { config: anthropicConfig, preset } = getModelPreset(
                'anthropic',
                config,
                resolveModelName('anthropic'),
            );
            return applyStreamingCapability(
                getAnthropicModel(anthropicConfig, preset, {
                    enableReasoning: options?.enableReasoning,
                }),
                anthropicConfig.supportsStreaming,
            );
        }
        case 'openrouter': {
            const openrouterConfig = config.providers.openrouter;
            if (!openrouterConfig) {
                throw new ParameterError(
                    'OpenRouter configuration is required',
                );
            }
            // OpenRouter doesn't use presets - uses model name directly
            return applyStreamingCapability(
                getOpenRouterModel(openrouterConfig),
                openrouterConfig.supportsStreaming,
            );
        }
        case 'bedrock': {
            const { config: bedrockConfig, preset } = getModelPreset(
                'bedrock',
                config,
                resolveModelName('bedrock'),
            );
            return applyStreamingCapability(
                getBedrockModel(bedrockConfig, preset, {
                    enableReasoning: options?.enableReasoning,
                }),
                bedrockConfig.supportsStreaming,
            );
        }
        default:
            return assertUnreachable(provider, `Invalid provider: ${provider}`);
    }
};

// Fast/lightweight-task model resolution that is BYO-key-aware. When the config
// resolves to a BYO Anthropic key, pick a fast model the key can serve (falling
// back to any accessible preset like opus 4.8 instead of erroring on haiku).
// Otherwise fall back to the standard fast-model selection. Never resolves to a
// provider the org didn't supply (defaultProvider is already switched upstream).
export const getFastModelForAccessibleKey = (
    config: LightdashConfig['ai']['copilot'],
    accessibleModelIds: string[] | null,
    options?: { enableReasoning?: boolean },
) => {
    const { anthropic } = config.providers;
    if (anthropic?.apiKey) {
        const preset = pickAmbientAnthropicPreset(accessibleModelIds);
        if (preset) {
            return applyStreamingCapability(
                getAnthropicModel(anthropic, preset, {
                    enableReasoning: options?.enableReasoning,
                }),
                anthropic.supportsStreaming,
            );
        }
    }
    return getModel(config, {
        useFastModel: true,
        enableReasoning: options?.enableReasoning,
    });
};

export const getCompactionModelMetadata = (
    config: LightdashConfig['ai']['copilot'],
    options?: {
        modelName?: string;
        provider?: typeof config.defaultProvider;
    },
): {
    supportsCompaction: boolean;
    contextWindowTokens: number | null;
} => {
    const provider = options?.provider ?? config.defaultProvider;

    if (provider === 'azure' || provider === 'openrouter') {
        return {
            supportsCompaction: false,
            contextWindowTokens: null,
        };
    }

    const { preset } = getModelPreset(provider, config, options?.modelName);

    return {
        supportsCompaction: true,
        contextWindowTokens: preset.contextWindowTokens,
    };
};
