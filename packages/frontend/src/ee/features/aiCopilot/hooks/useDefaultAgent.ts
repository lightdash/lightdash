import { useLocalStorage } from '@mantine-8/hooks';
import { useProjectAiAgents } from './useProjectAiAgents';

const DEFAULT_AGENT_KEY = (projectUuid: string) =>
    `lightdash:default-agent-uuid:${projectUuid}`;

const getInitialAgent = (
    projectUuid?: string | null,
    agents?: { uuid: string }[],
): string | null => {
    if (!projectUuid || !agents || agents.length === 0) return null;

    const defaultAgentUuid = localStorage.getItem(
        DEFAULT_AGENT_KEY(projectUuid),
    );

    const defaultAgent = agents.find(
        (agent) => agent.uuid === defaultAgentUuid,
    );

    return defaultAgent?.uuid || agents[0].uuid || null;
};

interface DefaultAgentReturn<AgentUuid = string> {
    defaultAgentUuid: AgentUuid | null;
    setDefaultAgentUuid: (
        v: (AgentUuid | null) | ((prevState: AgentUuid | null) => AgentUuid),
    ) => void;
    clearDefaultAgent: () => void;
}

/**
 * Manages the currently user's default AI agent for a project.
 * Persists selection in localStorage, falls back to the first available agent or returns null if none available.
 * Returns a tuple containing:
 * - defaultAgentUuid: Current default agent's uuid for the project. Nullable
 * - setDefaultAgentUuid: Function to update the default agent for the project
 * - clearDefaultAgent: Function to remove the default agent for the project
 */
export const useDefaultAgent = (
    projectUuid?: string | null,
): DefaultAgentReturn => {
    const { data: agents } = useProjectAiAgents(projectUuid);
    const [defaultAgentUuid, setDefaultAgentUuid, clearDefaultAgent] =
        useLocalStorage({
            key: DEFAULT_AGENT_KEY(projectUuid ?? ''),
            defaultValue: getInitialAgent(projectUuid, agents),
        });

    return { defaultAgentUuid, setDefaultAgentUuid, clearDefaultAgent };
};
