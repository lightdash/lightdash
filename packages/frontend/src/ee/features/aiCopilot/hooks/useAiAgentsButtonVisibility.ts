import { CommercialFeatureFlags } from '@lightdash/common';
import { useActiveProject } from '../../../../hooks/useActiveProject';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';
import { useAiAgentPermission } from './useAiAgentPermission';
import { useAiOrganizationSettings } from './useAiOrganizationSettings';
import { useProjectAiAgents } from './useProjectAiAgents';

/**
 * This hook is used to determine if the ai agent button should be visible
 * @returns true if the ai agent button should be visible
 */
export const useAiAgentButtonVisibility = () => {
    const activeProjectQuery = useActiveProject();
    const projectUuid = activeProjectQuery.data ?? undefined;

    const appQuery = useApp();
    const aiOrganizationSettingsQuery = useAiOrganizationSettings();
    const agentsQuery = useProjectAiAgents({
        projectUuid,
        options: {
            enabled:
                aiOrganizationSettingsQuery.isSuccess &&
                aiOrganizationSettingsQuery.data?.aiAgentsVisible,
        },
        redirectOnUnauthorized: false,
    });

    const canViewAiAgents = useAiAgentPermission({
        action: 'view',
        projectUuid,
    });
    const canManageAiAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid,
    });

    const aiCopilotFlagQuery = useServerFeatureFlag(
        CommercialFeatureFlags.AiCopilot,
    );

    if (
        agentsQuery.isLoading ||
        aiOrganizationSettingsQuery.isLoading ||
        appQuery.user.isLoading ||
        appQuery.health.isLoading ||
        aiCopilotFlagQuery.isLoading
    ) {
        return false;
    }

    const hasAgents = agentsQuery.data && agentsQuery.data.length > 0;
    const canViewButton = (canViewAiAgents && hasAgents) || canManageAiAgents;
    const isAiAgentEnabled = aiOrganizationSettingsQuery.data?.aiAgentsVisible;
    const isAiCopilotEnabledOrTrial =
        aiCopilotFlagQuery.data?.enabled ||
        aiOrganizationSettingsQuery.data?.isTrial;

    if (
        !canViewButton ||
        !canViewAiAgents ||
        !isAiAgentEnabled ||
        !projectUuid ||
        !isAiCopilotEnabledOrTrial
    ) {
        return false;
    }

    return true;
};
