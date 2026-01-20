import { CommercialFeatureFlags } from '@lightdash/common';
import useHealth from '../../../../hooks/health/useHealth';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';

/**
 * Checks if the ambient ai is enabled.
 * It checks if the shared anthropic api key is available or if the ai copilot feature flag is enabled
 */
export const useAmbientAiEnabled = () => {
    const { data: health } = useHealth();
    const { data: aiCopilotFlag } = useServerFeatureFlag(
        CommercialFeatureFlags.AiCopilot,
    );
    return health?.ai.isAmbientAiEnabled || aiCopilotFlag?.enabled;
};
