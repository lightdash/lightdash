import { type ApiSuccess } from '../../types/api/success';

/**
 * Body for kicking off an agentic writeback run. The prompt is executed by
 * the Claude Code CLI inside an isolated e2b sandbox.
 */
export type AgenticWritebackRequestBody = {
    prompt: string;
};

/**
 * Result of a (synchronous) agentic writeback run. `output` is the text the
 * agent produced; `exitCode` is the sandbox command's exit status.
 */
export type ApiAgenticWritebackResponse = ApiSuccess<{
    output: string;
    exitCode: number;
}>;
