import { CommercialFeatureFlags } from '@lightdash/common';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import { useAiOrganizationSettings } from './useAiOrganizationSettings';

// Raw "copilot available" signal: the AI copilot flag or an active trial.
// Unlike useAiAgentButtonVisibility this does not require agents to already
// exist, so a copilot-enabled org with no agents still counts as enabled.
export const useIsCopilotEnabled = () => {
    const flagQuery = useServerFeatureFlag(CommercialFeatureFlags.AiCopilot);
    const orgSettingsQuery = useAiOrganizationSettings();

    const isLoading = flagQuery.isLoading || orgSettingsQuery.isLoading;
    const isCopilotEnabled =
        !!flagQuery.data?.enabled || !!orgSettingsQuery.data?.isTrial;

    return { isCopilotEnabled, isLoading };
};
