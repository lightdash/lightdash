import type { AiAgentModelConfig, AiModelOption } from '@lightdash/common';

// Composite key format: "provider:name"
export const getModelKey = (model: AiModelOption): string =>
    `${model.provider}:${model.name}`;

const MODEL_PROVIDER_LABELS: Record<string, string> = {
    anthropic: 'Anthropic',
    bedrock: 'Amazon Bedrock',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
};

export const getModelGroupLabel = (model: AiModelOption): string =>
    model.groupLabel ?? MODEL_PROVIDER_LABELS[model.provider] ?? model.provider;

export const matchesModelConfig = (
    model: AiModelOption,
    modelConfig: AiAgentModelConfig,
): boolean =>
    model.provider === modelConfig.modelProvider &&
    (model.name === modelConfig.modelName ||
        model.modelId === modelConfig.modelName);

export const filterDeprecatedModelsForPicker = (
    models: AiModelOption[],
    selectedModelKey: string | null,
): AiModelOption[] =>
    models.filter(
        (model) => !model.deprecated || getModelKey(model) === selectedModelKey,
    );
