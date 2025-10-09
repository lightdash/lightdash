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
    const aiCopilotFlagQuery = useFeatureFlag(CommercialFeatureFlags.AiCopilot);
    const settings = useAiOrganizationSettings();
    const agents = useProjectAiAgents({
        projectUuid,
        options: {
            enabled: settings.isSuccess && settings.data.aiAgentsVisible,
        },
        redirectOnUnauthorized: false,
    });

    const canViewButton =
        (canViewAiAgents &&
            agents.isSuccess &&
            agents.data?.length &&
            agents.data.length > 0) ||
        canManageAiAgents;

    if (
        !appQuery.user.isSuccess ||
        !aiCopilotFlagQuery.isSuccess ||
        !settings.isSuccess
    ) {
        return false;
    }

    const isAiCopilotEnabled = aiCopilotFlagQuery.data.enabled;
    const isAiAgentEnabled = settings.data.aiAgentsVisible;

    if (
        !canViewButton ||
        !canViewAiAgents ||
        !isAiCopilotEnabled ||
        !isAiAgentEnabled ||
        !projectUuid
    ) {
        return false;
    }

    return true;
};
