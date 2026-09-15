import type { AiAgentModelConfig } from '@lightdash/common';
import { AI_PROVIDER_KEYS } from '../../../config/aiConfigSchema';
import type {
    ModelPreset,
    SelectableModelProvider,
} from '../ai/models/presets';
import type { AiProvider } from '../ai/models/types';
import { isModelConfigAvailable } from '../AiOrganizationSettingsService';

export type AutopilotModelChoice = { provider: AiProvider; modelName: string };

const isAiProvider = (value: string): value is AiProvider =>
    AI_PROVIDER_KEYS.some((key) => key === value);

// Org default first, then the instance default, then any model the org may use.
export const pickAutopilotModel = ({
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
