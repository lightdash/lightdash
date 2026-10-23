import { useActiveProject } from '../../../../hooks/useActiveProject';
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
                !!aiOrganizationSettingsQuery.data?.aiAgentsVisible &&
                aiOrganizationSettingsQuery.data.isCopilotEnabled,
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

    if (
        agentsQuery.isLoading ||
        aiOrganizationSettingsQuery.isLoading ||
        appQuery.user.isLoading ||
        appQuery.health.isLoading
    ) {
        return false;
    }

    const hasAgents = agentsQuery.data && agentsQuery.data.length > 0;
    const canViewButton = (canViewAiAgents && hasAgents) || canManageAiAgents;
    const isAiAgentEnabled = aiOrganizationSettingsQuery.data?.aiAgentsVisible;
    const isAiCopilotEnabled = appQuery.health.data?.ai.isCopilotAvailable;

    if (
        !canViewButton ||
        !canViewAiAgents ||
        !isAiAgentEnabled ||
        !projectUuid ||
        !isAiCopilotEnabled
    ) {
        return false;
    }

    return true;
};
