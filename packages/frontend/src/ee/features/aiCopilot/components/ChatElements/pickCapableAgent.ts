import { type CapableAgentRef } from './contentEditCallout';

type AgentLike = { uuid: string; name: string; enableContentTools: boolean };

// First edit-capable agent other than the current one, ordered by name.
export function pickCapableAgent({
    agents,
    currentAgentUuid,
}: {
    agents: AgentLike[];
    currentAgentUuid: string;
}): CapableAgentRef | null {
    const capable = agents
        .filter((a) => a.enableContentTools && a.uuid !== currentAgentUuid)
        .sort((a, b) => a.name.localeCompare(b.name));
    const first = capable[0];
    return first ? { uuid: first.uuid, name: first.name } : null;
}
