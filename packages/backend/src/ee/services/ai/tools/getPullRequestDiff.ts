import {
    ForbiddenError,
    getPullRequestDiffToolDefinition,
    type ToolGetPullRequestDiffStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { GetPullRequestDiffFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    getPullRequestDiff: GetPullRequestDiffFn;
};

type GetPullRequestDiffExecuteResult =
    | ExecuteStructuredToolResult<ToolGetPullRequestDiffStructuredContent>
    | ExecuteToolErrorResult;

const toolDefinition = getPullRequestDiffToolDefinition.for('agent');

// Cap the diff so a large pull request can't blow the context window.
// ~40k chars ≈ 10k tokens; the agent is told how to get the rest if truncated.
const MAX_DIFF_CHARS = 40_000;

// A short "owner/repo #123" label for the reply, parsed from the PR URL itself.
const labelForPr = (prUrl: string): string => {
    const match = prUrl.match(
        /(?:github|gitlab)[^/]*\/([^/]+)\/([^/]+)\/(?:pull|-\/merge_requests)\/(\d+)/,
    );
    return match ? `${match[1]}/${match[2]} #${match[3]}` : 'the pull request';
};

const summarizeDiff = (
    pullRequest: string,
    diff: string,
): ToolGetPullRequestDiffStructuredContent => {
    if (diff.trim().length === 0) {
        return { pullRequest, diff: '', truncated: false, totalChars: 0 };
    }
    const truncated = diff.length > MAX_DIFF_CHARS;
    return {
        pullRequest,
        diff: truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff,
        truncated,
        totalChars: diff.length,
    };
};

const renderDiff = ({
    pullRequest,
    diff,
    truncated,
    totalChars,
}: ToolGetPullRequestDiffStructuredContent): string => {
    if (diff.length === 0) {
        return `${pullRequest} has no file changes.`;
    }
    const note = truncated
        ? `\n\n[diff truncated at ${MAX_DIFF_CHARS} characters of ${totalChars} total — ask about a specific file if you need the rest.]`
        : '';
    return `Unified diff for ${pullRequest}:\n\n\`\`\`diff\n${diff}\n\`\`\`${note}`;
};

const errorOutput = (result: string): ExecuteToolErrorResult => ({
    result,
    metadata: { status: 'error' },
    structuredContent: { error: result },
});

export const getGetPullRequestDiff = ({ getPullRequestDiff }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            prUrl,
        }): Promise<GetPullRequestDiffExecuteResult> => {
            try {
                const diff = await getPullRequestDiff({ prUrl });
                const label = labelForPr(prUrl);
                // Null = couldn't be resolved: not this project's repo, no
                // installation, or an unparseable URL (see CiService).
                if (diff === null) {
                    return errorOutput(
                        `I couldn't read the diff for ${label}. It must be a pull request in this project's own repository, and I need source-code access to it.`,
                    );
                }
                const structuredContent = summarizeDiff(label, diff);
                return {
                    result: renderDiff(structuredContent),
                    metadata: { status: 'success' },
                    structuredContent,
                };
            } catch (error) {
                if (error instanceof ForbiddenError) {
                    return errorOutput(
                        `I couldn't read that pull request's diff — you don't have source-code access on this project. ${error.message}`,
                    );
                }
                return toolErrorOutput(
                    error,
                    'Error reading the pull request diff.',
                );
            }
        },
    });
