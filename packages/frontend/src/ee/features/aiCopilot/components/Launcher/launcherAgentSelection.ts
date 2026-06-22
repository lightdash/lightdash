import { type AiAgentSummary } from '@lightdash/common';

export const LAUNCHER_AUTO_AGENT = '__auto__';
export type LauncherActiveAgentUuid = string;
export type LauncherSelectedAgent =
    | AiAgentSummary
    | typeof LAUNCHER_AUTO_AGENT
    | null;

export const isLauncherAutoAgent = (
    agent: unknown,
): agent is typeof LAUNCHER_AUTO_AGENT => agent === LAUNCHER_AUTO_AGENT;

export const getLauncherAgentUuid = (agent: LauncherSelectedAgent) => {
    if (!agent) return null;
    return isLauncherAutoAgent(agent) ? LAUNCHER_AUTO_AGENT : agent.uuid;
};

export const getConcreteLauncherAgent = (agent: LauncherSelectedAgent) =>
    agent && !isLauncherAutoAgent(agent) ? agent : null;

export const resolveLauncherDefaultAgent = ({
    agents,
    defaultAgentUuid,
    isRouterEnabled,
    isRouterLoading,
}: {
    agents: AiAgentSummary[] | undefined;
    defaultAgentUuid: string | undefined;
    isRouterEnabled: boolean;
    isRouterLoading: boolean;
}): LauncherSelectedAgent => {
    if (!agents || agents.length === 0) return null;
    const defaultAgent = agents.find((a) => a.uuid === defaultAgentUuid);
    if (defaultAgent) return defaultAgent;
    if (agents.length > 1 && isRouterLoading) return null;
    if (agents.length > 1 && isRouterEnabled) return LAUNCHER_AUTO_AGENT;
    return agents[0];
};

export const isLauncherAgentAvailable = ({
    activeAgentUuid,
    agents,
    selectedAgent,
}: {
    activeAgentUuid: LauncherActiveAgentUuid | null;
    agents: AiAgentSummary[];
    selectedAgent: LauncherSelectedAgent;
}) => {
    if (!activeAgentUuid) return false;
    if (isLauncherAutoAgent(activeAgentUuid)) {
        return isLauncherAutoAgent(selectedAgent);
    }
    return agents.some((a) => a.uuid === activeAgentUuid);
};

export const getLauncherPanelAgent = (
    activeAgentUuid: LauncherActiveAgentUuid | null,
    agents: AiAgentSummary[],
): LauncherSelectedAgent => {
    if (!activeAgentUuid) return null;
    if (isLauncherAutoAgent(activeAgentUuid)) return LAUNCHER_AUTO_AGENT;
    return agents.find((a) => a.uuid === activeAgentUuid) ?? null;
};
