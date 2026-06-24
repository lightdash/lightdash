import type { AiAgentModelConfig, AiModelOption } from '@lightdash/common';
import { useCallback, useMemo, useReducer } from 'react';
import { getModelKey } from '../../../../components/common/ModelSelector/utils';
import { useAiOrganizationSettings } from './useAiOrganizationSettings';
import { useModelOptions } from './useModelOptions';

export const getModelOptionByKey = (
    modelOptions: AiModelOption[] | undefined,
    modelKey: string | null,
) => modelOptions?.find((model) => getModelKey(model) === modelKey);

export const getConfiguredModelOption = (
    modelOptions: AiModelOption[] | undefined,
    modelConfig: AiAgentModelConfig | null | undefined,
) =>
    modelOptions?.find(
        (model) =>
            model.name === modelConfig?.modelName &&
            model.provider === modelConfig?.modelProvider,
    );

export const getSystemDefaultModelOption = (
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

type UseAiAgentModelSelectionProps = {
    agentUuid: string | undefined;
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
    projectUuid,
    organizationSettingsEnabled = true,
}: UseAiAgentModelSelectionProps) => {
    const { data: modelOptions } = useModelOptions({ projectUuid, agentUuid });
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
    const defaultModelConfig =
        aiOrganizationSettings?.defaultAiAgentModelConfig;
    const isDefaultModelConfigReady =
        !organizationSettingsEnabled || isAiOrganizationSettingsFetched;
    const defaultModelSelection = useMemo(
        () =>
            modelOptions && isDefaultModelConfigReady
                ? getDefaultModelSelection(modelOptions, defaultModelConfig)
                : undefined,
        [defaultModelConfig, isDefaultModelConfigReady, modelOptions],
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
        modelConfig,
        modelOptions,
        selectedModel,
        selectedModelKey: effectiveSelectedModelKey,
        showExtendedThinking,
    };
};
