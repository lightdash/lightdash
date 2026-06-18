import { type FeatureFlags } from '@lightdash/common';
import type {
    PullRequestProvider,
    SessionUser,
    SupportedDbtVersions,
    WarehouseTypes,
} from '@lightdash/common';
import type { Sandbox } from 'e2b';
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

/**
 * Per-turn agent invocation parameters produced by a {@link CodingAgentConfig}:
 * the assembled system prompt plus the Claude Code CLI knobs that differ between
 * the dbt-writeback specialization and the general coding agent (tool allowlist,
 * extra `--add-dir` mounts, model).
 */
export type CodingAgentSetup = {
    systemPrompt: string;
    /** Claude Code `--allowedTools` string for this mode. */
    allowedTools: string;
    /** Extra `--add-dir` mounts beyond the repo CWD (e.g. /tmp, skills dirs). */
    addDirs: string[];
    /** Anthropic model the CLI runs with. */
    model: string;
};

/**
 * The injected, mode-specific half of a coding-agent run. The shared core
 * ({@link AiWritebackService.runCodingAgent}) owns sandbox lifecycle, network
 * lockdown, stream parsing, the signed-commit → PR pipeline, timeouts, and
 * analytics; this config supplies only what varies between the dbt-writeback
 * specialization and the general `editRepo` agent. dbt writeback is itself just
 * one config, so "no in-sandbox build / no Bash" for the general agent is a
 * property of its config, not a fork of the core.
 */
export type CodingAgentConfig = {
    /** Tags logs/analytics and selects the few remaining mode branches. */
    mode: 'dbt-writeback' | 'general';
    /**
     * The rollout feature flag this mode is gated behind (AiWriteback for dbt,
     * CodingAgent for the general agent). Asserted in `prepareTurn` for non
     * admin/changeset sources.
     */
    featureFlag: FeatureFlags;
    /** E2B template a fresh sandbox is created from (dbt vs lean image). */
    resolveTemplateRef: () => string;
    /** Extra options merged into `sandbox.git.clone` (e.g. a blob filter). */
    cloneExtraOptions: Record<string, unknown>;
    /**
     * Stage any sandbox prerequisites that inform the prompt (repo context,
     * profiles, tree listing) and build the system prompt + CLI knobs for this
     * turn. Runs after the repo is cloned/resumed and before the agent runs.
     */
    buildAgentSetup: (input: {
        sandbox: Sandbox;
        turn: TurnContext;
        repository: string;
    }) => Promise<CodingAgentSetup>;
    /**
     * Hook run immediately before the Claude CLI invocation — for side effects
     * that don't belong in the prompt (dbt: install the secret-stripping compile
     * wrapper, push warehouse skills, reset the compile-timings log).
     */
    beforeAgentRun: (sandbox: Sandbox, turn: TurnContext) => Promise<void>;
    /**
     * Hook run immediately after the Claude CLI exits — for diagnostics that
     * depend on what the agent did (dbt: read + report the compile timings).
     */
    afterAgentRun: (sandbox: Sandbox) => Promise<void>;
};

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
    /**
     * The project's configured dbt version, resolved to a concrete version
     * (`latest` is resolved to the newest supported version here, never passed
     * downstream). The compile wrapper prepends this version's venv bin to PATH
     * so the agent compiles with the version the project actually uses.
     */
    dbtVersion: SupportedDbtVersions;
};

export type AppliedChanges = {
    prUrl: string | null;
    prCreated: boolean;
    pauseOnExit: boolean;
    /** Head commit SHA this turn pushed; null when no commit was made. */
    commitSha: string | null;
    /** Lines this turn's commit added/removed; null when no commit was made. */
    additions: number | null;
    deletions: number | null;
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

/** Title/description/summary parsed out of the agent's final stdout. */
export type PrMetadata = {
    title: string | null;
    description: string | null;
    summary: string | null;
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
    /**
     * For the general coding agent (`editRepo`): the `owner/repo` the user asked
     * to edit. Slice 1 records it for logging but resolves the project's already
     * connected repo; arbitrary-repo targeting + per-repo write authz arrive in a
     * later slice. Ignored by the dbt-writeback path.
     */
    repoTarget?: string;
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
