import { CommercialFeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';
import { useAiOrganizationSettings } from './useAiOrganizationSettings';

// Raw "copilot available" signal: the AI copilot flag or an active trial.
// Unlike useAiAgentButtonVisibility this does not require agents to already
// exist, so a copilot-enabled org with no agents still counts as enabled.
export const useIsCopilotEnabled = () => {
    const { user } = useApp();
    // The flag is always off without a registered user, so skip the request.
    const flagQuery = useServerFeatureFlag(CommercialFeatureFlags.AiCopilot, {
        enabled: !!user.data,
    });
    const orgSettingsQuery = useAiOrganizationSettings();

    const isLoading = flagQuery.isInitialLoading || orgSettingsQuery.isLoading;
    const isCopilotEnabled =
        !!flagQuery.data?.enabled || !!orgSettingsQuery.data?.isTrial;

    return { isCopilotEnabled, isLoading };
};
