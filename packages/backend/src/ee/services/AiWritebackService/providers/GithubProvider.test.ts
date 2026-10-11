import { ParameterError, PullRequestProvider } from '@lightdash/common';
import {
    createBranch,
    createPullRequest,
    createSignedCommitOnBranch,
    getBranchHeadSha,
    getPullRequest,
    updatePullRequest,
} from '../../../../clients/github/Github';
import type { GithubConnection, GithubInstallation } from '../types';
import { GithubProvider } from './GithubProvider';

vi.mock('../../../../clients/github/Github', () => ({
    getPullRequest: vi.fn(),
    createBranch: vi.fn().mockResolvedValue(undefined),
    createPullRequest: vi.fn().mockResolvedValue({
        html_url: 'https://github.com/acme/analytics/pull/42',
    }),
    createSignedCommitOnBranch: vi.fn().mockResolvedValue({ oid: 'sha' }),
    getBranchHeadSha: vi.fn().mockResolvedValue('base'),
    updatePullRequest: vi.fn().mockResolvedValue(undefined),
}));

const mockGetPullRequest = getPullRequest as import('vitest').MockedFunction<
    typeof getPullRequest
>;

const provider = new GithubProvider({
    githubAppInstallationsModel: {} as never,
    githubAppService: {
        getValidUserToken: vi.fn().mockResolvedValue(undefined),
    } as never,
    logger: { info: vi.fn(), warn: vi.fn() } as never,
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
    userToken: null,
    commitAuthor: { name: 'a', email: 'a@b.c' },
    coAuthorTrailer: '',
};

const openPr = {
    state: 'open' as const,
    merged: false,
    headRef: 'feature/x',
    headRepoFullName: 'acme/analytics',
    mergeable: true,
    mergeableState: 'clean',
    draft: false,
    title: 'Add metric',
    additions: 9,
    deletions: 1,
    changedFiles: 1,
};

const adopt = (prUrl: string) =>
    provider.adoptPullRequest({ prUrl, connection, installation });

describe('GithubProvider.adoptPullRequest', () => {
    beforeEach(() => vi.clearAllMocks());

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

describe('GithubProvider publication authority', () => {
    beforeEach(() => vi.clearAllMocks());
    it.each([
        ...[false, true].flatMap((staged) =>
            [1, 2, 3, null].map((failAt) => ({
                action: 'open' as const,
                failAt,
                staged,
            })),
        ),
        ...[1, 2, null].map((failAt) => ({
            action: 'update' as const,
            failAt,
            staged: false,
        })),
    ])(
        '$action staged=$staged stops at check $failAt; allowed new PRs have three checks, updates two',
        async ({ action, failAt, staged }) => {
            const sandbox = {
                sandboxId: 'sandbox',
                git: {
                    status: vi
                        .fn()
                        .mockResolvedValue({ currentBranch: 'main' }),
                    createBranch: vi.fn(),
                    add: vi.fn(),
                    commit: vi.fn(),
                },
                commands: {
                    run: vi.fn().mockResolvedValue({ stdout: '', exitCode: 0 }),
                },
            };
            const error = new Error('person deactivated');
            let checks = 0;
            const assertPublishAllowed = vi.fn(async () => {
                checks += 1;
                if (checks === failAt) throw error;
            });
            const args = {
                sandbox: sandbox as never,
                connection,
                installation,
                title: 'Change',
                description: 'Change',
                user: { userUuid: 'u1' } as never,
                setStage: vi.fn(),
                onRemoteCommitted: vi.fn(),
                assertStagedChangesAllowed: staged ? vi.fn() : null,
                assertPublishAllowed,
            };
            const result =
                action === 'open'
                    ? provider.openPullRequest(args)
                    : provider.updatePullRequest({
                          ...args,
                          prUrl: 'https://github.com/acme/analytics/pull/42',
                      });
            if (failAt) await expect(result).rejects.toBe(error);
            else await result;
            const commitCheck = action === 'open' ? 2 : 1;
            const prCheck = commitCheck + 1;
            expect(createBranch).toHaveBeenCalledTimes(
                action === 'open' && failAt !== 1 ? 1 : 0,
            );
            expect(createSignedCommitOnBranch).toHaveBeenCalledTimes(
                failAt === null || failAt > commitCheck ? 1 : 0,
            );
            expect(createPullRequest).toHaveBeenCalledTimes(
                action === 'open' && failAt === null ? 1 : 0,
            );
            expect(updatePullRequest).toHaveBeenCalledTimes(
                action === 'update' && failAt === null ? 1 : 0,
            );
            expect(assertPublishAllowed).toHaveBeenCalledTimes(
                failAt ?? prCheck,
            );
        },
    );
});
