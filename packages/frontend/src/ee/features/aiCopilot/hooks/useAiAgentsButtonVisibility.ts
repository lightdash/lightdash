import { CommercialFeatureFlags } from '@lightdash/common';
import { useActiveProject } from '../../../../hooks/useActiveProject';
import { useFeatureFlag } from '../../../../hooks/useFeatureFlagEnabled';
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
    const organizationSettingsQuery = useAiOrganizationSettings();
    const agentsQuery = useProjectAiAgents({
        projectUuid,
        options: {
            enabled:
                organizationSettingsQuery.isSuccess &&
                organizationSettingsQuery.data?.aiAgentsVisible,
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

    const aiCopilotFlagQuery = useFeatureFlag(CommercialFeatureFlags.AiCopilot);

    if (
        agentsQuery.isLoading ||
        organizationSettingsQuery.isLoading ||
        appQuery.user.isLoading ||
        appQuery.health.isLoading ||
        aiCopilotFlagQuery.isLoading
    ) {
        return false;
    }

    const hasAgents = agentsQuery.data && agentsQuery.data.length > 0;
    const canViewButton = (canViewAiAgents && hasAgents) || canManageAiAgents;
    const isAiAgentEnabled = organizationSettingsQuery.data?.aiAgentsVisible;

    if (
        !canViewButton ||
        !canViewAiAgents ||
        !isAiAgentEnabled ||
        !projectUuid ||
        !aiCopilotFlagQuery.data?.enabled
    ) {
        return false;
    }

    return true;
};
