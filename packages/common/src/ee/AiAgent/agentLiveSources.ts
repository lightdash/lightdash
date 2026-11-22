import { ExploreType } from '../../types/explore';

/**
 * Which integrations an agent can use: `null` for every integration in the
 * project, `[]` for none, or the chosen integrations' uuids. Uuids of deleted
 * integrations match nothing, so they need no clean-up.
 */
export type AgentLiveSourceUuids = string[] | null;

export const isLiveSourceAvailableToAgent = (
    liveSourceUuids: AgentLiveSourceUuids,
    connectionUuid: string,
): boolean =>
    liveSourceUuids === null || liveSourceUuids.includes(connectionUuid);

/**
 * Whether an agent can use an explore. Only integration explores are scoped by
 * the agent's integrations; dbt explores are scoped by its tags instead.
 */
export const isExploreAvailableToAgentLiveSources = (
    explore: { type?: ExploreType; apiSource?: { connectionUuid: string } },
    liveSourceUuids: AgentLiveSourceUuids,
): boolean =>
    explore.type !== ExploreType.API_SOURCE ||
    !explore.apiSource ||
    isLiveSourceAvailableToAgent(
        liveSourceUuids,
        explore.apiSource.connectionUuid,
    );

/** What scopes an agent's explores: tags for dbt explores, integrations for live ones. */
export type AgentExploreScope = {
    tags: string[] | null;
    liveSourceUuids: AgentLiveSourceUuids;
};

/** Every explore the person can see, for paths outside an agent's scope. */
export const ALL_AGENT_EXPLORES: AgentExploreScope = {
    tags: null,
    liveSourceUuids: null,
};
