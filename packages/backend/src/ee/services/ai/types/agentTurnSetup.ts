import { type SessionUser } from '@lightdash/common';
import { type ModelCatalogue } from '../models';
import {
    type AiAgentDependencies,
    type StudioProjectMode,
    type TurnCard,
} from './aiAgent';
import { type GetExploreFn, type RunAsyncQueryFn } from './aiAgentDependencies';

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

/** What a thread's own kind asks of its saves; null for a thread it has no say in. */
export type FindAgentWritebackSetup = (save: {
    user: SessionUser;
    projectUuid: string;
    threadUuid: string;
}) => Promise<AgentWritebackSetup | null>;

/** The tools only some kinds of thread have. */
export type AgentExtraTools = Pick<
    AiAgentDependencies,
    | 'proposeSemanticLayerChange'
    | 'draftProjectContext'
    | 'listChanges'
    | 'getDraftExplore'
    | 'runDraftQuery'
    | 'readSemanticModel'
    | 'verify'
>;

/** Builds a kind of thread's own tools for one turn, from what the turn has already made. */
export type BuildAgentExtraTools = (turn: {
    promptUuid: string;
    threadUuid: string;
    getExplore: GetExploreFn;
    runAsyncQuery: RunAsyncQueryFn;
}) => AgentExtraTools;

const unavailable = async (): Promise<never> => {
    throw new Error('This tool is not available in this conversation');
};

// A loadout only offers these tools to a thread that brings them.
export const NO_AGENT_EXTRA_TOOLS: AgentExtraTools = {
    proposeSemanticLayerChange: unavailable,
    draftProjectContext: unavailable,
    listChanges: unavailable,
    getDraftExplore: unavailable,
    runDraftQuery: unavailable,
    readSemanticModel: unavailable,
    verify: unavailable,
};

/** Picks the model of a thread nobody chose one for, among those offered; null keeps the default. */
export type AgentModelPreference = (
    catalogue: ModelCatalogue,
    provider: string | null,
) => { provider: string; name: string } | null;

/** What the caller of a turn brings to it; an ordinary chat brings nothing. */
export type AgentTurnInputs = {
    /** Asked for when the turn starts, so a failure is recorded on the turn. */
    getTurnSetup: () => Promise<AgentTurnSetup>;
    buildExtraTools: BuildAgentExtraTools;
};
