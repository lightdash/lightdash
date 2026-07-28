import { CommercialFeatureFlags } from '@lightdash/common';
import { useActiveProject } from '../../../../hooks/useActiveProject';
import { useServerFeatureFlag } from '../../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../../providers/App/useApp';
import { useAiAgentPermission } from './useAiAgentPermission';
import { useAiOrganizationSettings } from './useAiOrganizationSettings';
import { useProjectAiAgents } from './useProjectAiAgents';

type AiAgentVisibility = {
    /** AI surfaces may be shown — true for anyone who can manage agents, even
     * when none exist yet. */
    isVisible: boolean;
    /** At least one agent is configured in the active project. */
    hasAgents: boolean;
    isLoading: boolean;
};

/**
 * Resolves whether AI agent surfaces should be shown, and whether an agent is
 * actually configured — callers that can't render anything useful without one
 * (see `useHomepageAiEnabled`) need to tell those two cases apart.
 */
export const useAiAgentVisibility = (): AiAgentVisibility => {
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
                (aiOrganizationSettingsQuery.data.isCopilotEnabled ||
                    aiOrganizationSettingsQuery.data.isTrial),
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

    const hasAgents = !!agentsQuery.data && agentsQuery.data.length > 0;

    if (
        agentsQuery.isLoading ||
        aiOrganizationSettingsQuery.isLoading ||
        appQuery.user.isLoading ||
        appQuery.health.isLoading ||
        aiCopilotFlagQuery.isLoading
    ) {
        return { isVisible: false, hasAgents, isLoading: true };
    }

    const canViewButton = (canViewAiAgents && hasAgents) || canManageAiAgents;
    const isAiAgentEnabled = aiOrganizationSettingsQuery.data?.aiAgentsVisible;
    const isAiCopilotEnabledOrTrial =
        aiCopilotFlagQuery.data?.enabled ||
        aiOrganizationSettingsQuery.data?.isTrial;

    const isVisible =
        !!canViewButton &&
        !!canViewAiAgents &&
        !!isAiAgentEnabled &&
        !!projectUuid &&
        !!isAiCopilotEnabledOrTrial;

    return { isVisible, hasAgents, isLoading: false };
};

/**
 * This hook is used to determine if the ai agent button should be visible
 * @returns true if the ai agent button should be visible
 */
export const useAiAgentButtonVisibility = () =>
    useAiAgentVisibility().isVisible;
