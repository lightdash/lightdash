import {
    ForbiddenError,
    ParameterError,
    PullRequestProvider,
} from '@lightdash/common';

/**
 * Thrown when a writeback cannot proceed because the project has no usable Git
 * connection — either the organization has not installed the GitHub/GitLab app,
 * or the project's dbt connection is not a GitHub/GitLab type. The `editDbtProject`
 * tool catches this specifically (via `instanceof`) and tags its result metadata
 * with a provider-specific `errorCode`, so the chat UI can render an actionable
 * "install the app" state instead of a generic failure.
 *
 * `provider` is the git host the project expects (GitHub/GitLab) when that is
 * known, or null when the project's dbt connection is not a Git type at all.
 */
export class WritebackGitNotConnectedError extends ForbiddenError {
    readonly provider: PullRequestProvider | null;

    constructor(
        provider: PullRequestProvider | null = null,
        message = 'This project is not connected to a GitHub or GitLab repository',
    ) {
        super(message);
        this.provider = provider;
    }
}

/**
 * Thrown when a resume turn's thread is bound to a pull/merge request that has
 * since been merged or closed (here or on the host). Editing it again would
 * push onto a dead branch and silently orphan the change, so the run bails. The
 * `editDbtProject` tool catches this (via `instanceof`) and tells the user to
 * start a new thread rather than rendering a generic failure or retrying.
 */
export class WritebackThreadPrClosedError extends ParameterError {
    readonly reason: 'merged' | 'closed';

    constructor(reason: 'merged' | 'closed') {
        super(
            `This thread's pull request has already been ${reason}, so it can't be updated. Tell the user that to make further changes they should start a new thread.`,
        );
        this.reason = reason;
    }
}

/**
 * Thrown by the general coding agent's pre-clone size guard when a target repo
 * exceeds `codingAgentMaxRepoSizeMb`. Fails closed before any sandbox/clone with
 * an actionable message (never a `deadline_exceeded` from a giant clone). The
 * `editRepo` tool catches it (via `instanceof`) and tags `repo_too_large`.
 */
export class RepoTooLargeError extends ParameterError {
    constructor(repo: string, sizeMb: number, limitMb: number) {
        super(
            `The repository ${repo} is too large to edit (${sizeMb} MB, limit is ${limitMb} MB). Tell the user the coding agent can't clone repositories above this size.`,
        );
    }
}
