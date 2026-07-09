import {
    InsufficientGitPermissionsError,
    PullRequestProvider,
} from '@lightdash/common';
import {
    WritebackGitNotConnectedError,
    WritebackThreadPrClosedError,
} from '../../AiWritebackService/errors';

export type WritebackErrorCode =
    | 'github_not_installed'
    | 'gitlab_not_installed'
    | 'unsupported_source_control'
    | 'pull_request_not_open'
    | 'git_write_permission'
    | 'unknown';

export const GIT_WRITE_PERMISSION_AGENT_MESSAGE = [
    'The change was prepared, but no pull request could be opened: this project’s Git connection does not have permission to create a branch (the host returned "Resource not accessible by integration").',
    'This is a one-time setup fix, NOT a transient error — do NOT retry, it will keep failing until the connection is fixed.',
    'Tell the user that an admin needs to either:',
    '1. Reconnect the dbt project to GitHub via the GitHub App (Project Settings → dbt connection → GitHub) instead of a personal access token. This is the recommended fix; or',
    '2. If they keep the personal access token, grant it write access to the repository (Contents: Read & write and Pull requests: Read & write).',
    'Once that is done they can ask you to try again. In the meantime, offer to give them the exact YAML patch to paste in manually so they are not blocked.',
].join('\n');

export const classifyWritebackError = (error: unknown): WritebackErrorCode => {
    if (error instanceof WritebackGitNotConnectedError) {
        if (error.provider === PullRequestProvider.GITHUB) {
            return 'github_not_installed';
        }
        if (error.provider === PullRequestProvider.GITLAB) {
            return 'gitlab_not_installed';
        }
        return 'unsupported_source_control';
    }
    if (error instanceof WritebackThreadPrClosedError) {
        return 'pull_request_not_open';
    }
    if (error instanceof InsufficientGitPermissionsError) {
        return 'git_write_permission';
    }
    return 'unknown';
};
