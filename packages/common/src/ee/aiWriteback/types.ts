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
 */
export type AiWritebackRunResult = {
    output: string;
    exitCode: number;
    prUrl: string | null;
};

export type ApiAiWritebackResponse = ApiSuccess<AiWritebackRunResult>;
