import { CommercialFeatureFlags } from '@lightdash/common';
import { useAiAccessGate } from '../../../../features/aiAccess/useAiAccessGate';
import useHealth from '../../../../hooks/health/useHealth';
import { useProjectUuid } from '../../../../hooks/useProjectUuid';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';

/**
 * Checks if the ambient ai is enabled.
 * It checks if the shared anthropic api key is available or if the ai copilot feature flag is enabled
 */
export const useAmbientAiEnabled = (projectUuid?: string) => {
    const routeProjectUuid = useProjectUuid();
    const { disabled } = useAiAccessGate(projectUuid ?? routeProjectUuid);
    const { data: health } = useHealth();
    const { user } = useApp();
    // The flag is always off without a registered user, so skip the request.
    const { data: aiCopilotFlag } = useServerFeatureFlag(
        CommercialFeatureFlags.AiCopilot,
        { enabled: !!user.data },
    );
    return (
        !disabled && (health?.ai.isAmbientAiEnabled || aiCopilotFlag?.enabled)
    );
};
