import type { AiAgentModelConfig, AiModelOption } from '@lightdash/common';

// Composite key format: "provider:name"
export const getModelKey = (model: AiModelOption): string =>
    `${model.provider}:${model.name}`;

const MODEL_PROVIDER_LABELS: Record<string, string> = {
    anthropic: 'Anthropic',
    bedrock: 'Amazon Bedrock',
    google: 'Google Gemini',
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

export type ModelReplacement = {
    model: AiModelOption;
    modelConfig: AiAgentModelConfig;
};

export const getSupersedingModel = (
    models: AiModelOption[],
    model: AiModelOption,
): AiModelOption | null =>
    model.supersededBy === null
        ? null
        : (models.find(
              (candidate) =>
                  candidate.provider === model.provider &&
                  candidate.name === model.supersededBy,
          ) ?? null);

// A retired model is swapped for its replacement when a prompt is created,
// so the picker shows the model a new chat will actually run on.
export const resolveModelForNewChat = (
    models: AiModelOption[],
    model: AiModelOption,
): AiModelOption => getSupersedingModel(models, model) ?? model;
