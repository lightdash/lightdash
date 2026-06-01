import { z } from 'zod';
import { type ApiSuccess } from '../../types/api/success';

/**
 * Body for kicking off an AI writeback run. The target repository is
 * cloned into a sandbox, the prompt is executed by the Claude Code CLI, and a
 * pull request is opened against the repo if the agent changes any files.
 *
 * The target repository (owner, repo) and the dbt project sub-folder are
 * resolved server-side from the Lightdash project's dbt connection — identified
 * by the `projectUuid` path parameter — so the caller only supplies the prompt.
 */
export type AiWritebackRequestBody = {
    prompt: string;
};

/**
 * Result of a (synchronous) AI writeback run.
 *
 * - `output` is the text the agent produced.
 * - `exitCode` is the sandbox command's exit status.
 * - `prUrl` is the URL of the pull request opened from the agent's changes, or
 *   `null` when the agent made no file changes (nothing to raise a PR for).
 * - `projectName` is the Lightdash project the run targeted.
 * - `repository` is the GitHub repository (`owner/repo`) the run targeted.
 * - `previewDeployConfigured` is whether the repo already deploys Lightdash
 *   preview projects via GitHub Actions: `true` set up, `false` not set up (the
 *   caller may offer to set it up), `null` when it could not be determined.
 */
export type AiWritebackRunResult = {
    output: string;
    exitCode: number;
    prUrl: string | null;
    projectName: string;
    repository: string;
    previewDeployConfigured: boolean | null;
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
