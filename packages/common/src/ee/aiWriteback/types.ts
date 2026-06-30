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
     */
    dbtSourceUuid: string | null;
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

export const MCP_TOOL_RUN_AI_WRITEBACK_DESCRIPTION = `Tool: run_ai_writeback

Purpose:
Make a change to the dbt project that backs the active Lightdash project by describing it in natural language, then open a pull request with the result. The target GitHub repository and dbt sub-folder are resolved server-side from the active project's dbt connection — you never specify them.

How it works:
- A sandbox is created, the project's GitHub repository is cloned, and the prompt is executed by the Claude Code CLI against the dbt project.
- If the agent changes any files, a branch is committed, pushed, and a pull request is opened. The PR URL is returned.
- If the agent makes no file changes, no PR is opened and prUrl is null.

Requirements:
- An active project must be set first via set_project (or the X-Lightdash-Project header).
- The project's dbt connection must be GitHub-backed, and the organization must have the GitHub App installed.
- The AI writeback feature must be enabled for the organization.

Important:
- This tool is NOT read-only and NOT idempotent — each call can open a new pull request. Use it only when the user explicitly wants to change their dbt project.
- The run is synchronous and can take a few minutes (cloning, running the agent, opening the PR).

Parameters:
- prompt: A clear, self-contained description of the change to make to the dbt project (e.g. "Add a 'total_revenue' metric to the orders model as the sum of amount").
- dbtSourceUuid (optional): When the project has more than one dbt source, the uuid of the source to change. Omit it to let the run infer the target from the prompt; if it cannot, the response asks you to choose and lists the available sources, after which you re-call with the chosen dbtSourceUuid.

Response shape (MCP CallToolResult):
- content: [{ type: "text", text: "<human-readable summary including the PR URL>" }]
- structuredContent: {
    output:   string,           // the agent's text output
    exitCode: number,           // the sandbox command's exit status
    prUrl:    string | null     // URL of the opened pull request, or null when no changes were made
  }
`;

export const mcpRunAiWritebackArgsSchema = z.object({
    prompt: z
        .string()
        .min(1)
        .describe(
            'A clear, self-contained description of the change to make to the dbt project that backs the active Lightdash project.',
        ),
    dbtSourceUuid: z
        .string()
        .optional()
        .describe(
            "Which of the project's dbt sources to change, when it has more than one. Omit to infer the target from the prompt; if the run cannot decide it returns the available sources to choose from, then you re-call with the chosen uuid.",
        ),
});

export const mcpRunAiWritebackStructuredOutputSchema = z.object({
    output: z.string().describe('The text output produced by the agent.'),
    exitCode: z.number().int().describe("The sandbox command's exit status."),
    prUrl: z
        .string()
        .nullable()
        .describe(
            'URL of the pull request opened from the agent changes, or null when the agent made no file changes.',
        ),
});

export type McpRunAiWritebackArgs = z.infer<typeof mcpRunAiWritebackArgsSchema>;
