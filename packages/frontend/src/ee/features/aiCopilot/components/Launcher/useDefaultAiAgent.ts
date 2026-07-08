import { useMemo } from 'react';
import { useAiOrganizationSettings } from '../../hooks/useAiOrganizationSettings';
import { useAiRouterConfig } from '../../hooks/useAiRouter';
import { useProjectAiAgents } from '../../hooks/useProjectAiAgents';
import { useGetUserAgentPreferences } from '../../hooks/useUserAgentPreferences';
import {
    getConcreteLauncherAgent,
    resolveLauncherDefaultAgent,
} from './launcherAgentSelection';

export const useDefaultAiAgent = (projectUuid: string | undefined) => {
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
    const agents = agentsQuery.data;
    const preferencesQuery = useGetUserAgentPreferences(projectUuid);
    const preferences = preferencesQuery.data;
    const aiRouterConfigQuery = useAiRouterConfig();

    const selectedAgent = useMemo(
        () =>
            resolveLauncherDefaultAgent({
                agents,
                defaultAgentUuid: preferences?.defaultAgentUuid,
                isRouterEnabled: aiRouterConfigQuery.data?.enabled === true,
                isRouterLoading: aiRouterConfigQuery.isLoading,
            }),
        [
            agents,
            aiRouterConfigQuery.data?.enabled,
            aiRouterConfigQuery.isLoading,
            preferences?.defaultAgentUuid,
        ],
    );

    const isResolving =
        agentsQuery.isLoading ||
        preferencesQuery.isLoading ||
        aiRouterConfigQuery.isLoading;

    return {
        agent: getConcreteLauncherAgent(selectedAgent),
        selectedAgent,
        agents: agents ?? [],
        isResolving,
    };
};
