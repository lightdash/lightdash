import {
    editRepoToolDefinition,
    ForbiddenError,
    InsufficientGitPermissionsError,
    PullRequestProvider,
} from '@lightdash/common';
import { tool } from 'ai';
import { DeniedPathError } from '../../AiWritebackService/deniedPaths';
import {
    WritebackGitNotConnectedError,
    WritebackThreadPrClosedError,
} from '../../AiWritebackService/errors';
import type { EditRepoFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    editRepo: EditRepoFn;
};

type EditRepoErrorCode =
    | 'repo_write_forbidden'
    | 'github_not_installed'
    | 'gitlab_not_installed'
    | 'pull_request_not_open'
    | 'git_write_permission'
    | 'repo_too_large'
    | 'denied_path'
    | 'unknown';

// Map a thrown error to the metadata code the chat card renders. A not-connected
// error carries the expected git host so the card can offer the matching install
// action; a ForbiddenError means the user/installation can't write the target.
const classifyEditRepoError = (error: unknown): EditRepoErrorCode => {
    if (error instanceof DeniedPathError) {
        return 'denied_path';
    }
    if (error instanceof ForbiddenError) {
        return 'repo_write_forbidden';
    }
    if (error instanceof WritebackGitNotConnectedError) {
        if (error.provider === PullRequestProvider.GITLAB) {
            return 'gitlab_not_installed';
        }
        return 'github_not_installed';
    }
    if (error instanceof WritebackThreadPrClosedError) {
        return 'pull_request_not_open';
    }
    if (error instanceof InsufficientGitPermissionsError) {
        return 'git_write_permission';
    }
    return 'unknown';
};

const toolDefinition = editRepoToolDefinition.for('agent');

export const getEditRepo = ({ editRepo }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async (
            { repoTarget, prompt, prUrl: pastedPrUrl },
            { toolCallId },
        ) => {
            try {
                const {
                    prUrl,
                    prAction,
                    commitSha,
                    additions,
                    deletions,
                    output,
                    repository,
                    steps,
                } = await editRepo({
                    repoTarget,
                    prompt,
                    prUrl: pastedPrUrl,
                    progressId: toolCallId,
                });

                const target = `repository ${repository}`;
                const prVerb = prAction === 'updated' ? 'Updated' : 'Opened';
                const result = prUrl
                    ? `${prVerb} a pull request against ${target}. A "View pull request" button is shown to the user, so do NOT include the pull request URL or number in your reply — just summarise the change and which repository it targeted.\n\nAgent summary:\n${output}`
                    : `Ran against ${target} but made no file changes, so no pull request was opened.\n\nAgent summary:\n${output}`;

                return {
                    result,
                    metadata: {
                        status: 'success' as const,
                        repository,
                        prUrl: prUrl ?? null,
                        prAction: prAction ?? null,
                        commitSha: commitSha ?? null,
                        additions: additions ?? null,
                        deletions: deletions ?? null,
                        steps,
                    },
                };
            } catch (error) {
                // A merged/closed thread PR is a terminal, expected state — not a
                // failure to retry. Surface its guidance verbatim.
                if (error instanceof WritebackThreadPrClosedError) {
                    return {
                        result: error.message,
                        metadata: {
                            status: 'error' as const,
                            errorCode: 'pull_request_not_open' as const,
                        },
                    };
                }
                // A commit touching a CI/workflow or secret path was rejected
                // host-side — terminal, do not retry. Relay the reason verbatim.
                if (error instanceof DeniedPathError) {
                    return {
                        result: `${error.message} Do not retry this — tell the user the agent will not edit CI/workflow or secret files. If they need that change, they must make it themselves.`,
                        metadata: {
                            status: 'error' as const,
                            errorCode: 'denied_path' as const,
                            reason: error.paths.join(', '),
                        },
                    };
                }
                // Forbidden write target: relay why (the user/installation can't
                // write the repo, or it's denylisted) without a retry suffix.
                if (error instanceof ForbiddenError) {
                    return {
                        result: `The change could not be made: you don't have write access to ${repoTarget} through this project's Git connection, or the repository can't be edited. ${error.message}`,
                        metadata: {
                            status: 'error' as const,
                            errorCode: 'repo_write_forbidden' as const,
                            reason: error.message,
                        },
                    };
                }
                return {
                    result: toolErrorHandler(
                        error,
                        'Error running the coding agent. No pull request was opened.',
                    ),
                    metadata: {
                        status: 'error' as const,
                        errorCode: classifyEditRepoError(error),
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
