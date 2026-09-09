import { PullRequestProvider } from '@lightdash/common';
import { WritebackGitNotConnectedError } from '../../AiWritebackService/errors';
import { classifyWritebackError } from './classifyWritebackError';

it.each([
    [PullRequestProvider.BITBUCKET, 'bitbucket_token_missing'],
    [PullRequestProvider.GITHUB, 'github_not_installed'],
    [PullRequestProvider.GITLAB, 'gitlab_not_installed'],
    [null, 'unsupported_source_control'],
])('gives setup guidance for %s', (provider, expected) => {
    expect(
        classifyWritebackError(new WritebackGitNotConnectedError(provider)),
    ).toBe(expected);
});
