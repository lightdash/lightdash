import type {
    PullRequestProvider,
    SessionUser,
    WarehouseTypes,
} from '@lightdash/common';
import type { AiWritebackFailureStage } from '../../../analytics/LightdashAnalytics';
import type { AiWritebackThreadWithPrUrl } from '../../models/AiWritebackThreadModel';
import type { GitProvider } from './providers/GitProvider';

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

/** Commit author identity stamped on writeback commits, for any git host. */
export type GitCommitAuthor = {
    name: string;
    email: string;
};

export type GithubConnection = {
    provider: PullRequestProvider.GITHUB;
    owner: string;
    repo: string;
    projectSubPath: string;
    /** The project's configured branch, or '' to fall back to the repo default. */
    branch: string;
};

export type GitlabConnection = {
    provider: PullRequestProvider.GITLAB;
    owner: string;
    repo: string;
    projectSubPath: string;
    /** `gitlab.com` or a self-hosted instance host, e.g. `gitlab.acme.com`. */
    hostDomain: string;
};

/**
 * The dbt repo a writeback run targets. Discriminated by `provider` so the
 * service can read the shared fields while each provider narrows for its own.
 */
export type GitConnection = GithubConnection | GitlabConnection;

export type AdoptedPullRequest = {
    prUrl: string;
    owner: string;
    repo: string;
    pullNumber: number;
    headRef: string;
};

export type GithubInstallation = {
    provider: PullRequestProvider.GITHUB;
    installationId: string;
    /** Installation access token — authenticates the in-sandbox clone. */
    token: string;
    /**
     * The triggering user's user-to-server token, when they have linked their
     * GitHub account (feature-flagged) and it can reach this repo. When set,
     * the API commits and the pull request are authored — and signed — as that
     * user, and no co-author trailer is added. Null → act as the app bot and
     * credit the triggering user as a commit co-author instead.
     */
    userToken: string | null;
    /** Author stamped on the (local, never-pushed) writeback commit — the Lightdash app identity. */
    commitAuthor: GitCommitAuthor;
    /**
     * `Co-authored-by:` trailer appended to the commit message to credit the
     * Lightdash app bot (resolved to its avatar-backed GitHub identity).
     */
    coAuthorTrailer: string;
};

export type GitlabInstallation = {
    provider: PullRequestProvider.GITLAB;
    /** OAuth access token for the org's GitLab app install — clone, push, MR API. */
    token: string;
    /** Instance base URL, e.g. `https://gitlab.com` or a self-hosted URL. */
    instanceUrl: string;
    /** Author stamped on the writeback commits — the GitLab user, or the fallback. */
    commitAuthor: GitCommitAuthor;
};

/** Resolved auth for the run's git host. Discriminated by `provider`. */
export type GitInstallation = GithubInstallation | GitlabInstallation;

/** HTTPS clone target; credentials are supplied out-of-band, never in the URL. */
export type CloneTarget = {
    url: string;
    username: string;
    password: string;
};

export type SetStage = (stage: AiWritebackFailureStage) => void;

export type TurnContext = {
    organizationUuid: string;
    projectName: string;
    /** Resolved once from the dbt connection type; the service never re-branches. */
    provider: GitProvider;
    gitConnection: GitConnection;
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
    | 'changeset';

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
    | {
          type: 'result';
          costUsd: number | null;
          /** Total agent wall-clock (ms) as reported by Claude Code. */
          durationMs: number | null;
          /** Time (ms) spent in LLM API calls — the rest is local tool execution. */
          durationApiMs: number | null;
          /** Number of agent turns. */
          numTurns: number | null;
      }
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
