import {
    editRepoToolDefinition,
    ForbiddenError,
    InsufficientGitPermissionsError,
    PullRequestProvider,
} from '@lightdash/common';
import { DeniedPathError } from '../../AiWritebackService/deniedPaths';
import {
    RepoTooLargeError,
    WritebackGitNotConnectedError,
    WritebackThreadPrClosedError,
} from '../../AiWritebackService/errors';
import type { EditRepoFn } from '../types/aiAgentDependencies';
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
    if (error instanceof RepoTooLargeError) {
        return 'repo_too_large';
    }
    // WritebackGitNotConnectedError extends ForbiddenError, so it MUST be
    // checked before the generic ForbiddenError branch — otherwise a missing
    // GitHub/GitLab app install is miscoded as repo_write_forbidden and the
    // chat card shows the wrong remediation (no install CTA).
    if (error instanceof WritebackGitNotConnectedError) {
        if (error.provider === PullRequestProvider.GITLAB) {
            return 'gitlab_not_installed';
        }
        return 'github_not_installed';
    }
    if (error instanceof ForbiddenError) {
        return 'repo_write_forbidden';
    }
    if (error instanceof WritebackThreadPrClosedError) {
        return 'pull_request_not_open';
    }
    if (error instanceof InsufficientGitPermissionsError) {
        return 'git_write_permission';
    }
    return 'unknown';
};

const toolDefinition = editRepoToolDefinition.for('ai-sdk');

export const getEditRepo = ({ editRepo }: Dependencies) =>
    toolDefinition.build({
        execute: async (
            { repoTarget, prompt, prUrl: pastedPrUrl, startNewPullRequest },
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
                    startNewPullRequest,
                    progressId: toolCallId,
                });

                const target = `repository ${repository}`;
                const prVerb = prAction === 'updated' ? 'Updated' : 'Opened';
                const result = prUrl
                    ? `${prVerb} a pull request against ${target}. A "View pull request" button is shown to the user, so do NOT include the pull request URL or number in your reply — just summarise the change and which repository it targeted.\n\nAgent summary:\n${output}`
                    : `Ran against ${target} but made no file changes, so no pull request was opened.\n\nAgent summary:\n${output}`;

                return {
                    status: 'success' as const,
                    type: 'string' as const,
                    result,
                    // These fields are already `T | null` on AiWritebackRunResult
                    // (never undefined), so they're passed through as-is — no
                    // `?? null` coalescing needed (L8).
                    metadata: {
                        status: 'success' as const,
                        repository,
                        prUrl,
                        prAction,
                        commitSha,
                        additions,
                        deletions,
                        steps,
                    },
                };
            } catch (error) {
                // A merged/closed thread PR is a terminal, expected state — not a
                // failure to retry. Surface its guidance verbatim.
                if (error instanceof WritebackThreadPrClosedError) {
                    return {
                        status: 'error' as const,
                        error: error.message,
                        metadata: {
                            status: 'error' as const,
                            errorCode: 'pull_request_not_open' as const,
                        },
                    };
                }
                // Repo too large — terminal, do not retry. Relay verbatim.
                if (error instanceof RepoTooLargeError) {
                    return {
                        status: 'error' as const,
                        error: error.message,
                        metadata: {
                            status: 'error' as const,
                            errorCode: 'repo_too_large' as const,
                        },
                    };
                }
                // A commit touching a CI/workflow or secret path was rejected
                // host-side — terminal, do not retry. Relay the reason verbatim.
                if (error instanceof DeniedPathError) {
                    return {
                        status: 'error' as const,
                        error: `${error.message} Do not retry this — tell the user the agent will not edit CI/workflow or secret files. If they need that change, they must make it themselves.`,
                        metadata: {
                            status: 'error' as const,
                            errorCode: 'denied_path' as const,
                            reason: error.paths.join(', '),
                        },
                    };
                }
                // Missing GitHub/GitLab app install. Must be checked BEFORE the
                // generic ForbiddenError branch below (this error extends it),
                // so the card renders the provider-specific install CTA instead
                // of a generic "no write access" message.
                if (error instanceof WritebackGitNotConnectedError) {
                    const errorCode =
                        error.provider === PullRequestProvider.GITLAB
                            ? ('gitlab_not_installed' as const)
                            : ('github_not_installed' as const);
                    return {
                        status: 'error' as const,
                        error: `The change could not be made: ${error.message} Tell the user they need to connect the ${
                            error.provider === PullRequestProvider.GITLAB
                                ? 'GitLab'
                                : 'GitHub'
                        } app for their organization.`,
                        metadata: {
                            status: 'error' as const,
                            errorCode,
                        },
                    };
                }
                // Forbidden write target: relay why (the user/installation can't
                // write the repo, or it's denylisted) without a retry suffix.
                if (error instanceof ForbiddenError) {
                    return {
                        status: 'error' as const,
                        error: `The change could not be made: you don't have write access to ${repoTarget} through this project's Git connection, or the repository can't be edited. ${error.message}`,
                        metadata: {
                            status: 'error' as const,
                            errorCode: 'repo_write_forbidden' as const,
                            reason: error.message,
                        },
                    };
                }
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(
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
    });
