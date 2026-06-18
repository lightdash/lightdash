import { ParameterError, PullRequestProvider } from '@lightdash/common';
import {
    createPullRequest,
    getMergeRequest,
} from '../../../../clients/gitlab/Gitlab';
import type { GitlabConnection, GitlabInstallation } from '../types';
import { GitlabProvider } from './GitlabProvider';

jest.mock('../../../../clients/gitlab/Gitlab', () => ({
    createPullRequest: jest.fn(),
    getMergeRequest: jest.fn(),
    updateMergeRequest: jest.fn(),
    getGitlabUser: jest.fn(),
    getOrRefreshToken: jest.fn(),
}));

const mockCreatePullRequest = createPullRequest as jest.MockedFunction<
    typeof createPullRequest
>;
const mockGetMergeRequest = getMergeRequest as jest.MockedFunction<
    typeof getMergeRequest
>;

const provider = new GitlabProvider({
    gitlabAppInstallationsModel: {} as never,
    gitlabConfig: { clientId: 'id', clientSecret: 'secret' },
    logger: { info: jest.fn(), warn: jest.fn() } as never,
});

const connection: GitlabConnection = {
    provider: PullRequestProvider.GITLAB,
    owner: 'acme',
    repo: 'analytics',
    projectSubPath: '.',
    hostDomain: 'gitlab.com',
};

const installation: GitlabInstallation = {
    provider: PullRequestProvider.GITLAB,
    token: 'gl-token',
    instanceUrl: 'https://gitlab.com',
    commitAuthor: { name: 'Jane', email: 'jane@acme.com' },
};

const fakeSandbox = () => ({
    sandboxId: 'sbx-1',
    git: {
        status: jest.fn().mockResolvedValue({ currentBranch: 'main' }),
        createBranch: jest.fn().mockResolvedValue(undefined),
        add: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        push: jest.fn().mockResolvedValue(undefined),
    },
    commands: { run: jest.fn().mockResolvedValue({ exitCode: 0, stdout: '' }) },
});

const openMr = {
    state: 'open' as const,
    merged: false,
    sourceBranch: 'feature/x',
    sourceProjectId: 1,
    targetProjectId: 1,
    webUrl: 'https://gitlab.com/acme/analytics/-/merge_requests/42',
};

describe('GitlabProvider.getCloneTarget', () => {
    it('builds an oauth2 HTTPS target', () => {
        expect(provider.getCloneTarget(connection, installation)).toEqual({
            url: 'https://gitlab.com/acme/analytics.git',
            username: 'oauth2',
            password: 'gl-token',
        });
    });

    it('rejects when the repo host differs from the connected app instance', () => {
        expect(() =>
            provider.getCloneTarget(
                { ...connection, hostDomain: 'gitlab.acme.com' },
                installation, // instanceUrl is https://gitlab.com
            ),
        ).toThrow(/does not match the connected GitLab app instance/);
    });
});

describe('GitlabProvider.openPullRequest', () => {
    beforeEach(() => jest.clearAllMocks());

    it('pushes the branch over oauth2 and opens a merge request', async () => {
        mockCreatePullRequest.mockResolvedValue({
            html_url: 'https://gitlab.com/acme/analytics/-/merge_requests/42',
            title: 'Add metric',
            number: 42,
        });
        const sandbox = fakeSandbox();

        const result = await provider.openPullRequest({
            sandbox: sandbox as never,
            connection,
            installation,
            title: 'Add metric',
            description: 'Adds revenue.',
            user: { userUuid: 'u1' } as never,
            setStage: jest.fn(),
            denyCiPaths: false,
        });

        expect(result.prUrl).toBe(
            'https://gitlab.com/acme/analytics/-/merge_requests/42',
        );
        expect(sandbox.git.push).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                remote: 'origin',
                username: 'oauth2',
                password: 'gl-token',
                setUpstream: true,
            }),
        );
        expect(mockCreatePullRequest).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: 'acme',
                repo: 'analytics',
                base: 'main',
                token: 'gl-token',
                hostDomain: 'gitlab.com',
            }),
        );
    });

    it('credits the triggering user as a commit co-author', async () => {
        mockCreatePullRequest.mockResolvedValue({
            html_url: 'https://gitlab.com/acme/analytics/-/merge_requests/42',
            title: 'Add metric',
            number: 42,
        });
        const sandbox = fakeSandbox();

        await provider.openPullRequest({
            sandbox: sandbox as never,
            connection,
            installation,
            title: 'Add metric',
            description: 'Adds revenue.',
            user: {
                firstName: 'Jane',
                lastName: 'Doe',
                email: 'jane@acme.com',
            } as never,
            setStage: jest.fn(),
            denyCiPaths: false,
        });

        expect(sandbox.git.commit).toHaveBeenCalledWith(
            expect.any(String),
            expect.stringContaining('Co-authored-by: Jane Doe <jane@acme.com>'),
            expect.anything(),
        );
    });
});

describe('GitlabProvider.adoptPullRequest', () => {
    beforeEach(() => jest.clearAllMocks());

    const adopt = (prUrl: string) =>
        provider.adoptPullRequest({ prUrl, connection, installation });

    it('adopts an open MR in the project', async () => {
        mockGetMergeRequest.mockResolvedValue(openMr);
        await expect(
            adopt('https://gitlab.com/acme/analytics/-/merge_requests/42'),
        ).resolves.toEqual({
            prUrl: 'https://gitlab.com/acme/analytics/-/merge_requests/42',
            owner: 'acme',
            repo: 'analytics',
            pullNumber: 42,
            headRef: 'feature/x',
        });
    });

    it('rejects an MR in a different project without calling GitLab', async () => {
        await expect(
            adopt('https://gitlab.com/evil/other/-/merge_requests/42'),
        ).rejects.toThrow(ParameterError);
        expect(mockGetMergeRequest).not.toHaveBeenCalled();
    });

    it('rejects an MR on a different host', async () => {
        await expect(
            adopt('https://gitlab.acme.com/acme/analytics/-/merge_requests/1'),
        ).rejects.toThrow(ParameterError);
        expect(mockGetMergeRequest).not.toHaveBeenCalled();
    });

    it('rejects a merged MR', async () => {
        mockGetMergeRequest.mockResolvedValue({ ...openMr, merged: true });
        await expect(
            adopt('https://gitlab.com/acme/analytics/-/merge_requests/42'),
        ).rejects.toThrow(/merged/);
    });

    it('rejects a closed MR', async () => {
        mockGetMergeRequest.mockResolvedValue({ ...openMr, state: 'closed' });
        await expect(
            adopt('https://gitlab.com/acme/analytics/-/merge_requests/42'),
        ).rejects.toThrow(/closed/);
    });

    it('rejects a fork-sourced MR (source project differs)', async () => {
        mockGetMergeRequest.mockResolvedValue({
            ...openMr,
            sourceProjectId: 2,
        });
        await expect(
            adopt('https://gitlab.com/acme/analytics/-/merge_requests/42'),
        ).rejects.toThrow(/fork/);
    });

    it('fails safe when the source/target project is unknown', async () => {
        mockGetMergeRequest.mockResolvedValue({
            ...openMr,
            sourceProjectId: null,
            targetProjectId: null,
        });
        await expect(
            adopt('https://gitlab.com/acme/analytics/-/merge_requests/42'),
        ).rejects.toThrow(/fork/);
    });
});
