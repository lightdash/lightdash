import {
    closePullRequestToolDefinition,
    ForbiddenError,
} from '@lightdash/common';
import type { ClosePullRequestFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    closePullRequest: ClosePullRequestFn;
};

const toolDefinition = closePullRequestToolDefinition.for('ai-sdk');

export const getClosePullRequest = ({ closePullRequest }: Dependencies) =>
    toolDefinition.build({
        execute: async ({ prUrl }) => {
            try {
                await closePullRequest({ prUrl });
                return {
                    status: 'success' as const,
                    type: 'string' as const,
                    result: `Closed the pull request. The card above reflects its closed state, so do NOT repeat the pull request URL — just confirm it was closed.`,
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                // A permission/ownership failure is terminal — the user can't
                // write this repo, or the URL isn't one of this project's PRs.
                // Relay it without a retry suggestion.
                if (error instanceof ForbiddenError) {
                    return {
                        status: 'error' as const,
                        error: `The pull request could not be closed: you don't have source-code write permission on this project, or that pull request doesn't belong to it. ${error.message}`,
                        metadata: { status: 'error' as const },
                    };
                }
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(
                        error,
                        'Error closing the pull request.',
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
