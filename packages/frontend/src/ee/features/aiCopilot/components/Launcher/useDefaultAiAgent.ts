import { useMemo } from 'react';
import { useAiOrganizationSettings } from '../../hooks/useAiOrganizationSettings';
import { useProjectAiAgents } from '../../hooks/useProjectAiAgents';
import { useGetUserAgentPreferences } from '../../hooks/useUserAgentPreferences';

export const useDefaultAiAgent = (projectUuid: string | undefined) => {
    const aiOrganizationSettingsQuery = useAiOrganizationSettings();
    const { data: agents } = useProjectAiAgents({
        projectUuid,
        options: {
            enabled:
                aiOrganizationSettingsQuery.isSuccess &&
                aiOrganizationSettingsQuery.data?.aiAgentsVisible,
        },
        redirectOnUnauthorized: false,
    });
    const { data: preferences } = useGetUserAgentPreferences(projectUuid);

    const agent = useMemo(() => {
        if (!agents || agents.length === 0) return null;
        return (
            agents.find((a) => a.uuid === preferences?.defaultAgentUuid) ??
            agents[0]
        );
    }, [agents, preferences?.defaultAgentUuid]);

    return { agent, agents: agents ?? [] };
};
