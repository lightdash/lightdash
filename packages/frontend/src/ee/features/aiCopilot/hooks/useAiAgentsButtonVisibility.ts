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
    const { data: projectUuid } = useActiveProject();
    const canViewAiAgents = useAiAgentPermission({
        action: 'view',
        projectUuid: projectUuid ?? undefined,
    });
    const appQuery = useApp();
    const canManageAiAgents = useAiAgentPermission({
        action: 'manage',
        projectUuid: projectUuid ?? undefined,
    });
    const organizationSettingsQuery = useAiOrganizationSettings();

    const agents = useProjectAiAgents({
        projectUuid,
        options: {
            enabled:
                organizationSettingsQuery.isSuccess &&
                organizationSettingsQuery.data?.aiAgentsVisible,
        },
        redirectOnUnauthorized: false,
    });

    const canViewButton =
        (canViewAiAgents &&
            agents.isSuccess &&
            agents.data?.length &&
            agents.data.length > 0) ||
        canManageAiAgents;

    if (!appQuery.user.isSuccess || !organizationSettingsQuery.isSuccess) {
        return false;
    }

    const isAiAgentEnabled = organizationSettingsQuery.data?.aiAgentsVisible;

    if (
        !canViewButton ||
        !canViewAiAgents ||
        !isAiAgentEnabled ||
        !projectUuid
    ) {
        return false;
    }

    return true;
};
