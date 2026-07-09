import {
    ForbiddenError,
    getPullRequestDiffToolDefinition,
} from '@lightdash/common';
import type { GetPullRequestDiffFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    getPullRequestDiff: GetPullRequestDiffFn;
};

const toolDefinition = getPullRequestDiffToolDefinition.for('ai-sdk');

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

export const getGetPullRequestDiff = ({ getPullRequestDiff }: Dependencies) =>
    toolDefinition.build({
        execute: async ({ prUrl }) => {
            try {
                const diff = await getPullRequestDiff({ prUrl });
                const label = labelForPr(prUrl);
                // Null = couldn't be resolved: not this project's repo, no
                // installation, or an unparseable URL (see CiService).
                if (diff === null) {
                    return {
                        status: 'error' as const,
                        error: `I couldn't read the diff for ${label}. It must be a pull request in this project's own repository, and I need source-code access to it.`,
                        metadata: { status: 'error' as const },
                    };
                }
                if (diff.trim().length === 0) {
                    return {
                        status: 'success' as const,
                        type: 'string' as const,
                        result: `${label} has no file changes.`,
                        metadata: { status: 'success' as const },
                    };
                }
                const truncated = diff.length > MAX_DIFF_CHARS;
                const body = truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff;
                const note = truncated
                    ? `\n\n[diff truncated at ${MAX_DIFF_CHARS} characters of ${diff.length} total — ask about a specific file if you need the rest.]`
                    : '';
                return {
                    status: 'success' as const,
                    type: 'string' as const,
                    result: `Unified diff for ${label}:\n\n\`\`\`diff\n${body}\n\`\`\`${note}`,
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                if (error instanceof ForbiddenError) {
                    return {
                        status: 'error' as const,
                        error: `I couldn't read that pull request's diff — you don't have source-code access on this project. ${error.message}`,
                        metadata: { status: 'error' as const },
                    };
                }
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(
                        error,
                        'Error reading the pull request diff.',
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
