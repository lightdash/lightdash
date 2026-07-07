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
    const { data: agents } = useProjectAiAgents({
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
    const { data: preferences } = useGetUserAgentPreferences(projectUuid);
    const aiRouterConfigQuery = useAiRouterConfig();

    const selectedAgent = useMemo(
        () =>
            resolveLauncherDefaultAgent({
                agents,
                defaultAgentUuid: preferences?.defaultAgentUuid,
                isRouterEnabled: aiRouterConfigQuery.data?.enabled === true,
            }),
        [
            agents,
            aiRouterConfigQuery.data?.enabled,
            preferences?.defaultAgentUuid,
        ],
    );

    return {
        agent: getConcreteLauncherAgent(selectedAgent),
        selectedAgent,
        agents: agents ?? [],
    };
};
