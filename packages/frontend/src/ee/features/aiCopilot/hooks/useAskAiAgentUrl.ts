import { useMemo } from 'react';
import { useProjectAiAgents } from './useProjectAiAgents';
import { useGetUserAgentPreferences } from './useUserAgentPreferences';

type Args = {
    projectUuid: string | undefined;
    chartUuid?: string;
    dashboardUuid?: string;
};

/**
 * Resolves the user's preferred AI agent for the given project and returns
 * the URL of that agent's new-thread page, with the chart/dashboard context
 * passed as query params for the destination page to render.
 *
 * Returns `null` while loading or when no agents are available.
 */
export const useAskAiAgentUrl = ({
    projectUuid,
    chartUuid,
    dashboardUuid,
}: Args): string | null => {
    const { data: agents } = useProjectAiAgents({
        projectUuid,
        redirectOnUnauthorized: false,
    });
    const { data: userAgentPreferences } =
        useGetUserAgentPreferences(projectUuid);

    return useMemo(() => {
        if (!projectUuid || !agents || agents.length === 0) return null;

        const preferredAgent =
            agents.find(
                (a) => a.uuid === userAgentPreferences?.defaultAgentUuid,
            ) ?? agents[0];

        const params = new URLSearchParams();
        if (chartUuid) params.set('chartUuid', chartUuid);
        if (dashboardUuid) params.set('dashboardUuid', dashboardUuid);
        const search = params.toString();

        return `/projects/${projectUuid}/ai-agents/${preferredAgent.uuid}/threads${
            search ? `?${search}` : ''
        }`;
    }, [
        projectUuid,
        agents,
        userAgentPreferences?.defaultAgentUuid,
        chartUuid,
        dashboardUuid,
    ]);
};
