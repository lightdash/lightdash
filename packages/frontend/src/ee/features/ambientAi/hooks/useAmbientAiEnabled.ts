import { CommercialFeatureFlags } from '@lightdash/common';
import useHealth from '../../../../hooks/health/useHealth';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';

/**
 * Checks if the ambient ai is enabled.
 * It checks if the shared anthropic api key is available or if the ai copilot feature flag is enabled
 */
export const useAmbientAiEnabled = () => {
    const { data: health } = useHealth();
    const { user } = useApp();
    // The flag is always off without a registered user, so skip the request.
    const { data: aiCopilotFlag } = useServerFeatureFlag(
        CommercialFeatureFlags.AiCopilot,
        { enabled: !!user.data },
    );
    return health?.ai.isAmbientAiEnabled || aiCopilotFlag?.enabled;
};
