import type { SessionUser, WarehouseTypes } from '@lightdash/common';
import type { AiWritebackFailureStage } from '../../../analytics/LightdashAnalytics';
import type { AiWritebackThreadWithPrUrl } from '../../models/AiWritebackThreadModel';

/**
 * The canonical warehouse keys we ship a skill file for. Several
 * `WarehouseTypes` map onto one key (e.g. `athena` → `trino`); warehouses with
 * no dedicated file (`clickhouse`, `duckdb`) resolve to `null` and the agent
 * gets `shared.md` only. Matches the filenames under `skills/warehouses/`.
 */
export type WarehouseSkillKey =
    | 'bigquery'
    | 'snowflake'
    | 'postgres'
    | 'redshift'
    | 'databricks'
    | 'trino';

export type GithubConnection = {
    owner: string;
    repo: string;
    projectSubPath: string;
};

export type AdoptedPullRequest = {
    prUrl: string;
    owner: string;
    repo: string;
    pullNumber: number;
    headRef: string;
};

export type GithubCommitAuthor = {
    name: string;
    email: string;
};

export type GithubInstallation = {
    installationId: string;
    /** Installation access token — authenticates the in-sandbox clone/push. */
    token: string;
    /**
     * OAuth user token used to open/update the pull request so it is attributed
     * to the GitHub user who connected the app for the org, not the Lightdash
     * app itself. `null` when no user identity could be resolved, in which case
     * the PR falls back to being opened by the app installation.
     */
    prToken: string | null;
    /** Author stamped on the writeback commits — the GitHub user, or the bot fallback. */
    commitAuthor: GithubCommitAuthor;
    /**
     * `Co-authored-by:` trailer appended to the commit message to credit the
     * Lightdash app bot (resolved to its avatar-backed GitHub identity), so the
     * agent's involvement is visible even though the commit is authored as the
     * user.
     */
    coAuthorTrailer: string;
};

export type SetStage = (stage: AiWritebackFailureStage) => void;

export type TurnContext = {
    organizationUuid: string;
    projectName: string;
    githubConnection: GithubConnection;
    existingRow: AiWritebackThreadWithPrUrl | null;
    isResume: boolean;
    /**
     * The project's warehouse dialect, used to pick the warehouse skill file
     * and stamped on every `ai_writeback.run.*` event for failure-rate-by-
     * warehouse slicing. `null` when the project has no warehouse connection.
     */
    warehouseType: WarehouseTypes | null;
};

export type AppliedChanges = {
    prUrl: string | null;
    prCreated: boolean;
    pauseOnExit: boolean;
};

export type AiWritebackSource =
    | 'slack'
    | 'web'
    | 'mcp'
    | 'api'
    | 'admin_review'
    | 'preview_deploy_setup';

/** Coarse phase of the agent's work, inferred from the tools it calls. */
export type AgentPhase = 'discovering' | 'editing' | 'compiling';

export type AgentToolCall = {
    name: string;
    input: unknown;
};

/**
 * The meaningful shapes of a Claude Code stream-json line. Everything the host
 * reacts to (assistant text, tool calls, the final cost summary) is one of
 * these; every other event type collapses to `ignored`.
 */
export type AgentStreamEvent =
    | { type: 'assistant'; text: string | null; toolCalls: AgentToolCall[] }
    | { type: 'result'; costUsd: number | null }
    | { type: 'ignored' };

/** Title/description parsed out of the agent's final stdout. */
export type PrMetadata = {
    title: string | null;
    description: string | null;
    sanitizedStdout: string;
};

/** Which channel a PR metadata value was ultimately recovered from. */
export type PrMetadataSource = 'tmp' | 'repo-fallback' | 'default';

export type ResolvedPrMetadata = {
    source: PrMetadataSource;
    value: string;
};

/** Paths parsed from `git diff --cached --name-status -z`, split by op. */
export type StagedFileChanges = {
    addPaths: string[];
    deletions: { path: string }[];
};

export type GithubIdentity = {
    login: string;
    id: number;
};

export type AiWritebackRunArgs = {
    user: SessionUser;
    projectUuid: string;
    prompt: string;
    // Honoured only when the thread has no writeback PR yet; the PR must live
    // in the project's own repo (validated before adoption).
    prUrl?: string | null;
    aiThreadUuid?: string;
    /**
     * Identifies the trigger surface so logs, metrics, and analytics can
     * group runs by where they originated. Required so adding new triggers
     * is a type-system change rather than a silent fallthrough.
     */
    source: AiWritebackSource;
    /**
     * Fired with a short, user-facing progress message each time the run
     * advances through a meaningful phase (e.g. "Starting sandbox",
     * "Discovering models"). Fire-and-forget — the callback should not throw
     * and the service does not await it. Used by callers that surface
     * progress live (the Slack agent updates its "Thinking…" message).
     */
    onProgress?: (message: string) => void;
};
