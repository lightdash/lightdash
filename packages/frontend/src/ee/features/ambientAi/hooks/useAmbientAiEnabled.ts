import { CommercialFeatureFlags } from '@lightdash/common';
import useHealth from '../../../../hooks/health/useHealth';
import { useFeatureFlagEnabled } from '../../../../hooks/useFeatureFlagEnabled';

/**
 * Checks if the ambient ai is enabled.
 * It checks if the shared anthropic api key is available or if the ai copilot feature flag is enabled
 */
export const useAmbientAiEnabled = () => {
    const { data: health } = useHealth();
    const isAiCopilotEnabled = useFeatureFlagEnabled(
        CommercialFeatureFlags.AiCopilot,
    );
    return health?.ai.isAmbientAiEnabled || isAiCopilotEnabled;
};
