import { describe, expect, it } from 'vitest';
import { isBitbucketPullRequest, summarisePrUrl } from './pullRequestCardUtils';

describe('Bitbucket pull request cards', () => {
    it('shows the workspace and repository from the pull request URL', () => {
        expect(
            summarisePrUrl(
                'https://bitbucket.org/workspace/jaffle/pull-requests/12',
            ),
        ).toBe('workspace/jaffle');
    });
    it.each([
        ['https://bitbucket.org/workspace/jaffle/pull-requests/12', true],
        [
            'https://bitbucket.org.evil.test/workspace/jaffle/pull-requests/12',
            false,
        ],
        ['https://github.com/workspace/jaffle/pull/12', false],
        [null, false],
        ['invalid URL', false],
    ])('recognizes the Bitbucket card %s', (url, expected) => {
        expect(isBitbucketPullRequest(url)).toBe(expected);
    });
});
