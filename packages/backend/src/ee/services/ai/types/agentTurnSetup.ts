import { type StudioProjectMode, type TurnCard } from './aiAgent';

/** What a kind of thread brings to each of its turns. */
export type AgentTurnSetup = {
    /** Set on a Semantic Studio thread; null otherwise. */
    studio: StudioProjectMode | null;
    turnCard: TurnCard | null;
    /** Runs SQL without asking, whichever request started the turn. */
    autoApproveSql: boolean;
    /** Whether fast decisions route the turn; they are for analytics turns. */
    usesFastDecisions: boolean;
    /** Whether the turn waits on the agent's attached MCP servers. */
    waitsOnMcpServers: boolean;
    /** Offers questions as choices without the ask-user flag. */
    asksWithoutFlag: boolean;
};

export const DEFAULT_AGENT_TURN_SETUP: AgentTurnSetup = {
    studio: null,
    turnCard: null,
    autoApproveSql: false,
    usesFastDecisions: true,
    waitsOnMcpServers: true,
    asksWithoutFlag: false,
};

/** What a kind of thread asks of a save to its dbt project. */
export type AgentWritebackSetup = {
    /** Every save of the thread goes to the same pull request. */
    continuesThreadPullRequest: boolean;
    /** Shows the pull request before its preview is built, which can take a minute. */
    showsPullRequestBeforePreview: boolean;
    /** Runs once a save has a commit on its pull request; null when nothing follows a save. */
    onSaved: ((prUrl: string) => Promise<void>) | null;
};

export const DEFAULT_AGENT_WRITEBACK_SETUP: AgentWritebackSetup = {
    continuesThreadPullRequest: false,
    showsPullRequestBeforePreview: false,
    onSaved: null,
};
