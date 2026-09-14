import { z } from 'zod';
import { type ApiSuccess } from '../../types/api/success';

/**
 * Body for kicking off an AI writeback run. The target repository is
 * cloned into a sandbox, the prompt is executed by the Claude Code CLI, and a
 * pull request is opened against the repo if the agent changes any files.
 *
 * The target repository (owner, repo) and the dbt project sub-folder are
 * resolved server-side from the chosen dbt source — by default the Lightdash
 * project's primary dbt connection (identified by the `projectUuid` path
 * parameter), or the source named by `dbtSourceUuid` when the project has more
 * than one dbt source.
 */
export type AiWritebackRequestBody = {
    prompt: string;
    /**
     * Which of the project's dbt sources to target, when it has more than one
     * (see {@link AiWritebackDbtSourceOption}). Pass the project's own uuid (or
     * omit) to target the primary dbt connection. When omitted and the project
     * has several sources, the run infers the target from the prompt and asks
     * the caller to choose if it can't (see `needsDbtSourceSelection`).
     */
    dbtSourceUuid?: string;
};

/**
 * One dbt source a writeback run can target, surfaced when a project has more
 * than one and the run needs the caller to choose. `projectDbtSourceUuid` is
 * the project's own uuid for the primary source and a row uuid for additional
 * sources — the same identifier the project's dbt-sources list returns, so the
 * caller can echo it straight back as `dbtSourceUuid`.
 */
export type AiWritebackDbtSourceOption = {
    projectDbtSourceUuid: string;
    name: string;
    isPrimary: boolean;
    repository: string | null;
    branch: string | null;
    projectSubPath: string | null;
};

/**
 * Whether a writeback run opened a brand-new pull request or updated an
 * existing one (a resumed thread or a pasted PR link). `null` when no pull
 * request was touched (the agent made no file changes).
 */
export type PullRequestWritebackAction = 'opened' | 'updated';

/**
 * Result of a (synchronous) AI writeback run.
 *
 * - `output` is the text the agent produced.
 * - `exitCode` is the sandbox command's exit status.
 * - `prUrl` is the URL of the pull request opened from the agent's changes, or
 *   `null` when the agent made no file changes (nothing to raise a PR for).
 * - `prAction` is whether that PR was newly opened or an existing one updated,
 *   or `null` when no PR was touched.
 * - `projectName` is the Lightdash project the run targeted.
 * - `repository` is the GitHub repository (`owner/repo`) the run targeted.
 */
/**
 * One action the writeback sandbox took, in a generic shape the chat UI can
 * group and render as step rows without knowing anything about writeback.
 * `kind` buckets the action (consecutive same-kind steps are grouped, e.g.
 * "Read 3 files"); `label` is the file basename or a stage description.
 */
export type AiWritebackStep = {
    kind: 'read' | 'edit' | 'search' | 'compile' | 'stage';
    label: string;
};

export type AiWritebackRunResult = {
    output: string;
    exitCode: number;
    prUrl: string | null;
    prAction: PullRequestWritebackAction | null;
    /**
     * Head commit SHA this turn pushed onto the PR's branch; null when no commit
     * was made (no file changes, or the agent crashed before pushing). Pins the
     * PR card's CI checks to this turn's commit so a later turn's commit can't
     * retroactively change what an earlier card shows.
     */
    commitSha: string | null;
    /** Lines this turn's commit added/removed; null when no commit was made. */
    additions: number | null;
    deletions: number | null;
    projectName: string;
    repository: string;
    /** Ordered actions the sandbox took, for the chat UI's step rows. */
    steps: AiWritebackStep[];
    /**
     * The dbt source this run targeted: a `project_dbt_sources` row uuid for an
     * additional source, or `null` for the project's primary dbt connection. A
     * thread stays bound to this source across resumes — one thread, one PR.
     * Optional so an older server's response (which omits it) doesn't surface as
     * `undefined` on a newer typed client.
     */
    dbtSourceUuid?: string | null;
    /**
     * Set when the project has several dbt sources and the run could not decide
     * which one the prompt targets. No sandbox is started and no pull request is
     * opened; `dbtSourceOptions` lists the choices and the caller should re-run
     * with `dbtSourceUuid` set to one of them. Absent on a normal run.
     */
    needsDbtSourceSelection?: boolean;
    /** The dbt sources to choose from when `needsDbtSourceSelection` is set. */
    dbtSourceOptions?: AiWritebackDbtSourceOption[];
};

export type ApiAiWritebackResponse = ApiSuccess<AiWritebackRunResult>;

export type AiWritebackRunStatusResult = {
    status: AiWritebackRunStatus;
    prUrl: string | null;
    errorMessage: string | null;
};

export type ApiAiWritebackRunStatusResponse =
    ApiSuccess<AiWritebackRunStatusResult>;

export type AiWritebackSource =
    | 'slack'
    | 'web'
    | 'mcp'
    | 'api'
    | 'admin_review'
    | 'changeset';

export type AiWritebackWorkstream = 'dbt-writeback' | 'general';

export const AI_WRITEBACK_STAGES = [
    'install',
    'sandbox',
    'clone',
    'agent',
    'commit',
    'push',
    'pull_request',
] as const;

export type AiWritebackFailureStage = (typeof AI_WRITEBACK_STAGES)[number];

export const AI_WRITEBACK_RUN_TERMINAL_STATUSES = [
    'ready',
    'error',
    'cancelled',
] as const;

/**
 * Once a run's git side effects begin (commit → push → PR), cancellation is
 * refused: the finalize claim moves the row into 'commit' atomically, and
 * markCancelled excludes these stages so a cancel can never race an
 * in-flight push into an unrecorded pull request.
 */
export const AI_WRITEBACK_RUN_FINALIZING_STATUSES = [
    'commit',
    'push',
    'pull_request',
] as const;

export type AiWritebackRunStatus =
    | 'pending'
    | AiWritebackFailureStage
    | (typeof AI_WRITEBACK_RUN_TERMINAL_STATUSES)[number];

export const isAiWritebackRunInProgress = (
    status: AiWritebackRunStatus,
): boolean =>
    !(AI_WRITEBACK_RUN_TERMINAL_STATUSES as readonly string[]).includes(status);

export const MCP_TOOL_RUN_AI_WRITEBACK_DESCRIPTION = `Tool: run_ai_writeback

Change a Lightdash project's dbt project from a natural-language prompt. The GitHub repository and dbt sub-folder are resolved server-side from its dbt connection; never specify them.

Safety and requirements:
- NOT read-only or idempotent: each call can start a run and open a new pull request. Use only when the user explicitly wants a dbt change.
- Requires a GitHub-backed dbt connection, the organization's GitHub App installation, and AI writeback enabled for the organization.

Execution:
- Returns immediately with aiWritebackRunUuid; does not wait for completion. A background sandbox clones the project's GitHub repository and runs the prompt through Claude Code CLI against dbt. If files change, a branch is committed and pushed, and a pull request opened.
- Runs usually take a few minutes. Poll get_ai_writeback_status every 10-15 seconds with aiWritebackRunUuid for progress and the pull request URL.
- Clients declaring io.modelcontextprotocol/tasks in per-request capabilities instead get a task handle (resultType: "task", taskId = run id). Poll tasks/get and cancel via tasks/cancel, rather than using get_ai_writeback_status.

Input:
- prompt: a clear, self-contained change, e.g. "Add a total_revenue metric to orders as the sum of amount".
- With multiple dbt sources, name the intended source in the prompt, e.g. "In the marketing dbt project, ..."; never pass a source ID. If ambiguous, the run ends with status "error" and an error message listing the source names. Call run_ai_writeback again with the intended source named in the prompt.

Normal response (MCP CallToolResult): content contains a text message saying the run started and to poll get_ai_writeback_status; structuredContent is { aiWritebackRunUuid: string }.
`;

export const mcpRunAiWritebackArgsSchema = z.object({
    prompt: z
        .string()
        .min(1)
        .describe(
            'A clear, self-contained description of the change to make to the dbt project that backs the target Lightdash project. If the project has more than one dbt source, name the intended one here (e.g. "In jaffle-2, add ...") — a later get_ai_writeback_status call reports whether the run could tell which source you meant.',
        ),
});

export const mcpRunAiWritebackStructuredOutputSchema = z.object({
    aiWritebackRunUuid: z
        .string()
        .describe(
            'Id of the writeback run that just started. Pass this to get_ai_writeback_status to check progress and get the pull request URL.',
        ),
    // Only present on the final result of a task-augmented call (MCP Tasks
    // extension): the synchronous response carries just the run id.
    status: z
        .string()
        .optional()
        .describe(
            'Final run status. Only present on the completed result of a task-augmented call.',
        ),
    prUrl: z
        .string()
        .nullable()
        .optional()
        .describe(
            'URL of the opened pull request, or null when the run made no changes or failed. Only present on the completed result of a task-augmented call.',
        ),
    errorMessage: z
        .string()
        .nullable()
        .optional()
        .describe(
            'Why the run failed, or null on success. Only present on the completed result of a task-augmented call.',
        ),
});

export type McpRunAiWritebackArgs = z.infer<typeof mcpRunAiWritebackArgsSchema>;

export const MCP_TOOL_GET_AI_WRITEBACK_STATUS_DESCRIPTION = `Tool: get_ai_writeback_status

Purpose:
Check the status of a writeback run started by run_ai_writeback, and get the pull request URL once it's ready.

Important:
- Poll every 10-15 seconds rather than immediately looping — a run typically takes a few minutes.
- "status" is either "pending" (not yet picked up), an in-progress pipeline stage (e.g. "sandbox", "agent", "pull_request"), or a terminal value: "ready" (finished — check prUrl), "error" (finished — check errorMessage; this also covers the "more than one dbt source" case described in run_ai_writeback), or "cancelled" (stopped before finishing).

Parameters:
- aiWritebackRunUuid: The id returned by run_ai_writeback.

Response shape (MCP CallToolResult):
- content: [{ type: "text", text: "<human-readable status summary>" }]
- structuredContent: {
    status:       string,        // "pending" | a pipeline stage | "ready" | "error" | "cancelled"
    prUrl:        string | null, // set once status is "ready" and a PR was opened
    errorMessage: string | null  // set once status is "error"
  }
`;

export const mcpGetAiWritebackStatusArgsSchema = z.object({
    aiWritebackRunUuid: z
        .string()
        .uuid()
        .describe('The id returned by run_ai_writeback.'),
});

export const mcpGetAiWritebackStatusStructuredOutputSchema = z.object({
    status: z
        .string()
        .describe(
            '"pending" | a pipeline stage (e.g. "sandbox", "agent", "pull_request") | "ready" | "error" | "cancelled".',
        ),
    prUrl: z
        .string()
        .nullable()
        .describe(
            'URL of the pull request opened from the agent changes, set once status is "ready"; null if the agent made no file changes or the run has not finished yet.',
        ),
    errorMessage: z
        .string()
        .nullable()
        .describe('Set once status is "error"; null otherwise.'),
});

export type McpGetAiWritebackStatusArgs = z.infer<
    typeof mcpGetAiWritebackStatusArgsSchema
>;
