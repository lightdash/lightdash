import type { AiAgentModelConfig } from '@lightdash/common';
import { AI_PROVIDER_KEYS } from '../../../config/aiConfigSchema';
import type {
    ModelPreset,
    SelectableModelProvider,
} from '../ai/models/presets';
import type { AiProvider } from '../ai/models/types';
import { isModelConfigAvailable } from '../AiOrganizationSettingsService';

export type AutopilotModelChoice = { provider: AiProvider; modelName: string };

// Autopilot runs unattended, so on these providers it uses the model that
// passed the cleanup scorecard rather than the chat default, when the
// organisation may still use it.
const AUTOPILOT_PREFERRED_MODELS: Partial<Record<AiProvider, string>> = {
    anthropic: 'claude-opus-4-7',
    bedrock: 'claude-opus-4-7',
};

const preferQualifiedModel = (
    choice: AutopilotModelChoice | null,
    availableModels: ModelPreset<SelectableModelProvider>[],
): AutopilotModelChoice | null => {
    if (!choice) return null;
    const preferred = AUTOPILOT_PREFERRED_MODELS[choice.provider];
    const visible =
        preferred !== undefined &&
        availableModels.some(
            (model) =>
                model.provider === choice.provider && model.name === preferred,
        );
    return visible && preferred
        ? { provider: choice.provider, modelName: preferred }
        : choice;
};

const isAiProvider = (value: string): value is AiProvider =>
    AI_PROVIDER_KEYS.some((key) => key === value);

// Org default first, then the instance default, then any model the org may use.
const pickProviderDefault = ({
    orgDefault,
    instanceDefault,
    availableModels,
}: {
    orgDefault: AiAgentModelConfig | null;
    instanceDefault: { provider: AiProvider; name: string } | null;
    availableModels: ModelPreset<SelectableModelProvider>[];
}): AutopilotModelChoice | null => {
    if (
        orgDefault &&
        isAiProvider(orgDefault.modelProvider) &&
        isModelConfigAvailable(orgDefault, availableModels)
    ) {
        return {
            provider: orgDefault.modelProvider,
            modelName: orgDefault.modelName,
        };
    }
    if (instanceDefault) {
        // Azure has no preset catalog: the configured deployment is the model.
        const usable =
            instanceDefault.provider === 'azure' ||
            isModelConfigAvailable(
                {
                    modelProvider: instanceDefault.provider,
                    modelName: instanceDefault.name,
                },
                availableModels,
            );
        if (usable) {
            return {
                provider: instanceDefault.provider,
                modelName: instanceDefault.name,
            };
        }
    }
    const preset =
        availableModels.find(
            (model) => model.provider === instanceDefault?.provider,
        ) ?? availableModels[0];
    return preset
        ? { provider: preset.provider, modelName: preset.name }
        : null;
};

export const pickAutopilotModel = (args: {
    orgDefault: AiAgentModelConfig | null;
    instanceDefault: { provider: AiProvider; name: string } | null;
    availableModels: ModelPreset<SelectableModelProvider>[];
}): AutopilotModelChoice | null =>
    preferQualifiedModel(pickProviderDefault(args), args.availableModels);
