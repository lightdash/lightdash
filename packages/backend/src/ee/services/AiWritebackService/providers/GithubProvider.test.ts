import { ParameterError, PullRequestProvider } from '@lightdash/common';
import { getPullRequest } from '../../../../clients/github/Github';
import type { GithubConnection, GithubInstallation } from '../types';
import { GithubProvider } from './GithubProvider';

jest.mock('../../../../clients/github/Github', () => ({
    getPullRequest: jest.fn(),
}));

const mockGetPullRequest = getPullRequest as jest.MockedFunction<
    typeof getPullRequest
>;

const provider = new GithubProvider({
    githubAppInstallationsModel: {} as never,
    logger: { info: jest.fn(), warn: jest.fn() } as never,
});

const connection: GithubConnection = {
    provider: PullRequestProvider.GITHUB,
    owner: 'acme',
    repo: 'analytics',
    projectSubPath: '.',
    branch: 'main',
};

const installation: GithubInstallation = {
    provider: PullRequestProvider.GITHUB,
    installationId: 'inst-1',
    token: 'tok',
    commitAuthor: { name: 'a', email: 'a@b.c' },
    coAuthorTrailer: '',
};

const openPr = {
    state: 'open' as const,
    merged: false,
    headRef: 'feature/x',
    headRepoFullName: 'acme/analytics',
};

const adopt = (prUrl: string) =>
    provider.adoptPullRequest({ prUrl, connection, installation });

describe('GithubProvider.adoptPullRequest', () => {
    beforeEach(() => jest.clearAllMocks());

    it('adopts an open PR in the project repo', async () => {
        mockGetPullRequest.mockResolvedValue(openPr);
        await expect(
            adopt('https://github.com/acme/analytics/pull/42'),
        ).resolves.toEqual({
            prUrl: 'https://github.com/acme/analytics/pull/42',
            owner: 'acme',
            repo: 'analytics',
            pullNumber: 42,
            headRef: 'feature/x',
        });
    });

    it('rejects a PR in a different repo without calling GitHub', async () => {
        await expect(
            adopt('https://github.com/evil/other/pull/42'),
        ).rejects.toThrow(ParameterError);
        expect(mockGetPullRequest).not.toHaveBeenCalled();
    });

    it('rejects a merged PR', async () => {
        mockGetPullRequest.mockResolvedValue({ ...openPr, merged: true });
        await expect(
            adopt('https://github.com/acme/analytics/pull/42'),
        ).rejects.toThrow(/merged/);
    });

    it('rejects a closed PR', async () => {
        mockGetPullRequest.mockResolvedValue({ ...openPr, state: 'closed' });
        await expect(
            adopt('https://github.com/acme/analytics/pull/42'),
        ).rejects.toThrow(/closed/);
    });

    it('rejects a PR opened from a fork', async () => {
        mockGetPullRequest.mockResolvedValue({
            ...openPr,
            headRepoFullName: 'fork/analytics',
        });
        await expect(
            adopt('https://github.com/acme/analytics/pull/42'),
        ).rejects.toThrow(/fork/);
    });

    it('rejects a PR whose head repo is unknown', async () => {
        mockGetPullRequest.mockResolvedValue({
            ...openPr,
            headRepoFullName: null,
        });
        await expect(
            adopt('https://github.com/acme/analytics/pull/42'),
        ).rejects.toThrow(ParameterError);
    });

    it('matches the project repo case-insensitively and normalizes the url', async () => {
        mockGetPullRequest.mockResolvedValue(openPr);
        await expect(
            adopt('https://github.com/ACME/Analytics/pull/7'),
        ).resolves.toMatchObject({
            prUrl: 'https://github.com/acme/analytics/pull/7',
            pullNumber: 7,
        });
    });

    it('rejects a non-github host', async () => {
        await expect(
            adopt('https://gitlab.com/acme/analytics/pull/1'),
        ).rejects.toThrow(ParameterError);
        expect(mockGetPullRequest).not.toHaveBeenCalled();
    });

    it('rejects a malformed url', async () => {
        await expect(adopt('not a url')).rejects.toThrow(ParameterError);
    });
});
