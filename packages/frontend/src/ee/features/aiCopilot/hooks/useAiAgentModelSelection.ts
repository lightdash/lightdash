import type { AiAgentModelConfig, AiModelOption } from '@lightdash/common';
import { useLocalStorage } from '@mantine-8/hooks';
import { useCallback, useMemo, useReducer } from 'react';
import { getModelKey } from '../../../../components/common/ModelSelector/utils';
import { useAiOrganizationSettings } from './useAiOrganizationSettings';
import { useModelOptions } from './useModelOptions';

// Schema-bump escape hatch: bumping the version invalidates older shapes
// rather than requiring runtime migration.
const STORAGE_KEY_PREFIX = 'aiAgentsModelSelection:v1';
// Storage scope for agent-less contexts (the router page).
const NO_AGENT_SCOPE = '_';

type StoredModelSelection = {
    modelKey: string | null;
    extendedThinking: boolean | null;
};

// Storage is user-writable, so narrow each field instead of trusting the shape.
const normalizeStoredSelection = (
    value: StoredModelSelection | null,
): StoredModelSelection => ({
    modelKey: typeof value?.modelKey === 'string' ? value.modelKey : null,
    extendedThinking:
        typeof value?.extendedThinking === 'boolean'
            ? value.extendedThinking
            : null,
});

const clampExtendedThinking = (
    supportsReasoning: boolean,
    extendedThinking: boolean | null,
): boolean | null => (supportsReasoning ? extendedThinking : false);

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
                extendedThinking: clampExtendedThinking(
                    action.supportsReasoning,
                    action.extendedThinking,
                ),
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
    // Scoped per agent so a user's pick in one agent doesn't shadow the
    // admin-configured default of another.
    const [storedSelection, setStoredSelection] =
        useLocalStorage<StoredModelSelection | null>({
            key: `${STORAGE_KEY_PREFIX}:${agentUuid ?? NO_AGENT_SCOPE}`,
            defaultValue: null,
            getInitialValueInEffect: false,
        });
    const {
        modelKey: storedModelKey,
        extendedThinking: storedExtendedThinking,
    } = normalizeStoredSelection(storedSelection);
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
    // A stored model only applies if it still exists in the current options —
    // models removed by an admin fall back to the default.
    const storedModel = getModelOptionByKey(modelOptions, storedModelKey);
    const effectiveSelectedModelKey =
        selectedModelKey ??
        (storedModel ? getModelKey(storedModel) : null) ??
        (defaultModelSelection?.model
            ? getModelKey(defaultModelSelection.model)
            : null);

    const selectedModel = useMemo(
        () => getModelOptionByKey(modelOptions, effectiveSelectedModelKey),
        [effectiveSelectedModelKey, modelOptions],
    );

    const effectiveExtendedThinking =
        extendedThinking ??
        (storedModel && selectedModel?.supportsReasoning
            ? storedExtendedThinking
            : null) ??
        defaultModelSelection?.extendedThinking ??
        false;

    const showExtendedThinking = selectedModel?.supportsReasoning ?? false;

    const handleSelectedModelKeyChange = useCallback(
        (modelKey: string) => {
            const model = getModelOptionByKey(modelOptions, modelKey);
            const supportsReasoning = model?.supportsReasoning ?? false;
            dispatch({
                type: 'setModel',
                modelKey,
                supportsReasoning,
                extendedThinking: effectiveExtendedThinking,
            });
            // Persist the raw toggle (null = untouched) so a displayed default
            // isn't captured as a user preference.
            setStoredSelection({
                modelKey,
                extendedThinking: clampExtendedThinking(
                    supportsReasoning,
                    extendedThinking,
                ),
            });
        },
        [
            effectiveExtendedThinking,
            extendedThinking,
            modelOptions,
            setStoredSelection,
        ],
    );

    const handleExtendedThinkingChange = useCallback(
        (extendedThinkingValue: boolean) => {
            dispatch({
                type: 'setExtendedThinking',
                extendedThinking: extendedThinkingValue,
            });
            // Persist only alongside a stored model pick — a thinking-only
            // toggle must not pin the current default model as a preference.
            setStoredSelection((prev) => {
                const normalized = normalizeStoredSelection(prev ?? null);
                return normalized.modelKey === null
                    ? normalized
                    : {
                          ...normalized,
                          extendedThinking: extendedThinkingValue,
                      };
            });
        },
        [setStoredSelection],
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
            selectedModelKey !== null ||
            extendedThinking !== null ||
            storedModel !== undefined,
        modelConfig,
        modelOptions,
        selectedModel,
        selectedModelKey: effectiveSelectedModelKey,
        showExtendedThinking,
    };
};
