import type { AiAgentModelConfig, AiModelOption } from '@lightdash/common';
import { useCallback, useMemo, useReducer } from 'react';
import { getModelKey } from '../../../../components/common/ModelSelector/utils';
import { useAiOrganizationSettings } from './useAiOrganizationSettings';
import { useModelOptions } from './useModelOptions';

export const getModelOptionByKey = (
    modelOptions: AiModelOption[] | undefined,
    modelKey: string | null,
) => modelOptions?.find((model) => getModelKey(model) === modelKey);

const getConfiguredModelOption = (
    modelOptions: AiModelOption[] | undefined,
    modelConfig: AiAgentModelConfig | null | undefined,
) =>
    modelOptions?.find(
        (model) =>
            model.name === modelConfig?.modelName &&
            model.provider === modelConfig?.modelProvider,
    );

const getSystemDefaultModelOption = (
    modelOptions: AiModelOption[] | undefined,
) => modelOptions?.find((model) => model.default);

const getDefaultModelSelection = (
    modelOptions: AiModelOption[] | undefined,
    modelConfig: AiAgentModelConfig | null | undefined,
) => {
    const configuredModel = getConfiguredModelOption(modelOptions, modelConfig);
    const model = configuredModel ?? getSystemDefaultModelOption(modelOptions);

    if (!model) return undefined;

    return {
        model,
        extendedThinking:
            configuredModel?.supportsReasoning === true &&
            modelConfig?.reasoning === true,
    };
};

export const getAiAgentModelConfig = (
    model: AiModelOption | undefined,
    extendedThinking: boolean,
): AiAgentModelConfig | undefined =>
    model
        ? {
              modelName: model.name,
              modelProvider: model.provider,
              reasoning: model.supportsReasoning ? extendedThinking : undefined,
          }
        : undefined;

type UseDefaultAiAgentModelProps = {
    modelOptions: AiModelOption[] | undefined;
    modelConfig: AiAgentModelConfig | null | undefined;
    fallbackModelConfig?: AiAgentModelConfig | null;
    fallbackLabel: string;
};

export const useDefaultAiAgentModel = ({
    modelOptions,
    modelConfig,
    fallbackModelConfig,
    fallbackLabel,
}: UseDefaultAiAgentModelProps) => {
    const selectedModel = useMemo(
        () => getConfiguredModelOption(modelOptions, modelConfig),
        [modelConfig, modelOptions],
    );
    const selectedModelKey = selectedModel ? getModelKey(selectedModel) : null;
    const fallbackModel = useMemo(
        () =>
            getConfiguredModelOption(modelOptions, fallbackModelConfig) ??
            getSystemDefaultModelOption(modelOptions),
        [fallbackModelConfig, modelOptions],
    );
    const fallbackModelLabel = fallbackModel
        ? `${fallbackLabel}: ${fallbackModel.displayName}`
        : fallbackLabel;
    const showReasoningDefault = selectedModel?.supportsReasoning === true;

    return {
        fallbackModel,
        fallbackModelLabel,
        selectedModel,
        selectedModelKey,
        showReasoningDefault,
    };
};

type UseAiAgentModelSelectionProps = {
    agentUuid: string | undefined;
    defaultModelConfig?: AiAgentModelConfig | null | undefined;
    projectUuid: string | undefined;
    organizationSettingsEnabled?: boolean;
};

type ModelSelectionState = {
    extendedThinking: boolean | null;
    selectedModelKey: string | null;
};

type ModelSelectionAction =
    | { type: 'setExtendedThinking'; extendedThinking: boolean }
    | {
          type: 'setModel';
          modelKey: string;
          supportsReasoning: boolean;
          extendedThinking: boolean;
      };

const modelSelectionReducer = (
    state: ModelSelectionState,
    action: ModelSelectionAction,
): ModelSelectionState => {
    switch (action.type) {
        case 'setExtendedThinking':
            return {
                ...state,
                extendedThinking: action.extendedThinking,
            };
        case 'setModel':
            return {
                selectedModelKey: action.modelKey,
                extendedThinking: action.supportsReasoning
                    ? action.extendedThinking
                    : false,
            };
    }
};

export const useAiAgentModelSelection = ({
    agentUuid,
    defaultModelConfig,
    projectUuid,
    organizationSettingsEnabled = true,
}: UseAiAgentModelSelectionProps) => {
    const { data: agentModelOptions } = useModelOptions({
        projectUuid,
        agentUuid,
    });
    const {
        data: aiOrganizationSettings,
        isFetched: isAiOrganizationSettingsFetched,
    } = useAiOrganizationSettings({
        enabled: organizationSettingsEnabled,
    });
    const [{ extendedThinking, selectedModelKey }, dispatch] = useReducer(
        modelSelectionReducer,
        {
            extendedThinking: null,
            selectedModelKey: null,
        },
    );
    const organizationDefaultModelConfig =
        aiOrganizationSettings?.defaultAiAgentModelConfig;
    const resolvedDefaultModelConfig =
        defaultModelConfig ?? organizationDefaultModelConfig;
    const modelOptions =
        agentModelOptions ?? aiOrganizationSettings?.defaultAiAgentModelOptions;
    const isDefaultModelConfigReady =
        !organizationSettingsEnabled || isAiOrganizationSettingsFetched;
    const defaultModelSelection = useMemo(
        () =>
            modelOptions && isDefaultModelConfigReady
                ? getDefaultModelSelection(
                      modelOptions,
                      resolvedDefaultModelConfig,
                  )
                : undefined,
        [isDefaultModelConfigReady, modelOptions, resolvedDefaultModelConfig],
    );
    const effectiveSelectedModelKey =
        selectedModelKey ??
        (defaultModelSelection?.model
            ? getModelKey(defaultModelSelection.model)
            : null);
    const effectiveExtendedThinking =
        extendedThinking ?? defaultModelSelection?.extendedThinking ?? false;

    const selectedModel = useMemo(
        () => getModelOptionByKey(modelOptions, effectiveSelectedModelKey),
        [effectiveSelectedModelKey, modelOptions],
    );

    const showExtendedThinking = selectedModel?.supportsReasoning ?? false;

    const handleSelectedModelKeyChange = useCallback(
        (modelKey: string) => {
            const model = getModelOptionByKey(modelOptions, modelKey);
            dispatch({
                type: 'setModel',
                modelKey,
                supportsReasoning: model?.supportsReasoning ?? false,
                extendedThinking: effectiveExtendedThinking,
            });
        },
        [effectiveExtendedThinking, modelOptions],
    );

    const handleExtendedThinkingChange = useCallback(
        (extendedThinkingValue: boolean) => {
            dispatch({
                type: 'setExtendedThinking',
                extendedThinking: extendedThinkingValue,
            });
        },
        [],
    );

    const modelConfig = useMemo(
        () => getAiAgentModelConfig(selectedModel, effectiveExtendedThinking),
        [effectiveExtendedThinking, selectedModel],
    );

    return {
        extendedThinking: effectiveExtendedThinking,
        handleExtendedThinkingChange,
        handleSelectedModelKeyChange,
        isModelSelectionExplicit:
            selectedModelKey !== null || extendedThinking !== null,
        modelConfig,
        modelOptions,
        selectedModel,
        selectedModelKey: effectiveSelectedModelKey,
        showExtendedThinking,
    };
};
