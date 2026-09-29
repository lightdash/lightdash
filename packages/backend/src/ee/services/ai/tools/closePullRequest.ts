import {
    closePullRequestToolDefinition,
    ForbiddenError,
    type ToolClosePullRequestStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ClosePullRequestFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    closePullRequest: ClosePullRequestFn;
};

const toolDefinition = closePullRequestToolDefinition.for('agent');

export const getClosePullRequest = ({ closePullRequest }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            prUrl,
        }): Promise<
            | ExecuteStructuredToolResult<ToolClosePullRequestStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                await closePullRequest({ prUrl });
                const closed: ToolClosePullRequestStructuredContent = {
                    prUrl,
                    state: 'closed',
                };
                return {
                    result: `Closed the pull request. The card above reflects its ${closed.state} state, so do NOT repeat the pull request URL — just confirm it was closed.`,
                    metadata: { status: 'success' },
                    structuredContent: closed,
                };
            } catch (error) {
                // A permission/ownership failure is terminal — the user can't
                // write this repo, or the URL isn't one of this project's PRs.
                // Relay it without a retry suggestion.
                if (error instanceof ForbiddenError) {
                    const result = `The pull request could not be closed: you don't have source-code write permission on this project, or that pull request doesn't belong to it. ${error.message}`;
                    return {
                        result,
                        metadata: { status: 'error' },
                        structuredContent: { error: result },
                    };
                }
                return toolErrorOutput(
                    error,
                    'Error closing the pull request.',
                );
            }
        },
    });
