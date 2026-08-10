import type { AiAgentModelConfig, AiModelOption } from '@lightdash/common';

// Composite key format: "provider:name"
export const getModelKey = (model: AiModelOption): string =>
    `${model.provider}:${model.name}`;

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
