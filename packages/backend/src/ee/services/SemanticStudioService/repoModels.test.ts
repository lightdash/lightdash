import { DbtProjectType } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import {
    createSignedCommitOnBranch,
    getInstallationAccessToken,
    getLastCommit,
    getPullRequest,
    getPullRequestDiffFiles,
    getRepoTree,
} from '../../../clients/github/Github';
import {
    describePullRequest,
    RepoModelSource,
    resolveRepoConnection,
} from './repoModels';

vi.mock('../../../clients/github/Github', () => ({
    getInstallationAccessToken: vi.fn(async () => ({
        token: 'token',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })),
    getPullRequest: vi.fn(async () => ({ merged: false, state: 'open' })),
    getLastCommit: vi.fn(async () => ({ sha: 'sha' })),
    getRepoTree: vi.fn(async () => ({ files: [], truncated: false })),
    getPullRequestDiffFiles: vi.fn(async () => ({ files: [] })),
    createSignedCommitOnBranch: vi.fn(async () => undefined),
}));

const github = {
    type: DbtProjectType.GITHUB,
    authorization_method: 'installation_id',
    repository: 'acme/analytics',
    branch: 'main',
    project_sub_path: '/analytics/',
} as const;

describe('resolveRepoConnection', () => {
    it('reads a GitHub project that keeps native models', () => {
        expect(
            resolveRepoConnection({ ...github, semanticLayer: 'lightdash' }),
        ).toEqual({
            owner: 'acme',
            repo: 'analytics',
            branch: 'main',
            projectSubPath: 'analytics',
        });
    });

    it('is nothing for a dbt project or a project with no repository', () => {
        expect(resolveRepoConnection(github)).toBeNull();
        expect(resolveRepoConnection({ type: DbtProjectType.NONE })).toBeNull();
    });

    it('is nothing for a connection that does not use the GitHub App on github.com', () => {
        const native = { ...github, semanticLayer: 'lightdash' } as const;
        expect(
            resolveRepoConnection({
                ...native,
                authorization_method: 'personal_access_token',
            }),
        ).toBeNull();
        expect(
            resolveRepoConnection({
                ...native,
                host_domain: 'github.example.com',
            }),
        ).toBeNull();
        expect(
            resolveRepoConnection({ ...native, host_domain: 'GitHub.com' }),
        ).not.toBeNull();
    });
});

describe('RepoModelSource', () => {
    it('mints one installation token for reads until it nears expiry', async () => {
        const source = new RepoModelSource({
            githubAppInstallationsModel: {
                findInstallationId: async () => '42',
            },
        });
        const connection = resolveRepoConnection({
            ...github,
            semanticLayer: 'lightdash',
        });
        if (!connection) throw new Error('expected a connection');
        await source.load('org', connection);
        await source.load('org', connection);
        expect(getInstallationAccessToken).toHaveBeenCalledTimes(1);
        expect(getLastCommit).toHaveBeenCalledTimes(2);
        expect(getRepoTree).toHaveBeenCalledTimes(1);
    });
});

describe('describePullRequest', () => {
    const result = (model: string, status: 'ready' | 'failed' = 'ready') => ({
        model,
        status,
        changes: [{ path: 'metrics.total', action: 'added' as const }],
        refusals: [],
        error: null,
        notes: [],
    });

    it('names the models that change and lists each change once', () => {
        expect(
            describePullRequest([
                result('a'),
                result('a'),
                result('b', 'failed'),
            ]),
        ).toEqual({
            title: 'Update semantic layer: a',
            body: '- `a`\n  - added `metrics.total`',
        });
    });

    it('keeps a long title short', () => {
        expect(
            describePullRequest(['a', 'b', 'c', 'd', 'e'].map((m) => result(m)))
                .title,
        ).toBe('Update semantic layer: a, b, c and 2 more');
    });
});

describe('getPullRequestState', () => {
    it('reads PR state without CI checks and reuses the installation token', async () => {
        const source = new RepoModelSource({
            githubAppInstallationsModel: {
                findInstallationId: async () => 'installation',
            },
        });
        vi.mocked(getInstallationAccessToken).mockClear();
        vi.mocked(getPullRequest).mockClear();
        expect(
            await source.getPullRequestState(
                'org',
                github,
                'https://github.com/acme/analytics/pull/1',
            ),
        ).toBe('open');
        expect(
            await source.getPullRequestState(
                'org',
                github,
                'https://github.com/acme/analytics/pull/2',
            ),
        ).toBe('open');
        expect(getInstallationAccessToken).toHaveBeenCalledTimes(1);
        expect(getPullRequest).toHaveBeenCalledTimes(2);
    });

    it.each([
        'https://github.com/other/analytics/pull/1',
        'https://github.example/acme/analytics/pull/1',
        'https://example.com/github.com/acme/analytics/pull/1',
    ])('refuses a URL outside the configured repository: %s', async (url) => {
        const findInstallationId = vi.fn();
        const source = new RepoModelSource({
            githubAppInstallationsModel: { findInstallationId },
        });
        expect(await source.getPullRequestState('org', github, url)).toBeNull();
        expect(findInstallationId).not.toHaveBeenCalled();
    });
});

describe('updatePullRequest', () => {
    const source = () =>
        new RepoModelSource({
            githubAppInstallationsModel: {
                findInstallationId: async () => 'installation',
            },
        });
    const models = {
        connection: {
            owner: 'acme',
            repo: 'analytics',
            branch: 'main',
            projectSubPath: '',
        },
        baseSha: 'base',
        documents: [{ name: 'orders', content: 'orders on main' }],
        paths: new Map([['orders', 'models/orders.yml']]),
        modelsDirectory: 'models',
    };
    const base64 = (text: string) => Buffer.from(text).toString('base64');

    it('commits to the open pull request, and puts back what the draft no longer changes', async () => {
        vi.mocked(getPullRequest).mockResolvedValueOnce({
            merged: false,
            state: 'open',
            headRef: 'lightdash-semantic-studio/abc',
            headSha: 'head',
        } as Awaited<ReturnType<typeof getPullRequest>>);
        vi.mocked(getPullRequestDiffFiles).mockResolvedValueOnce({
            files: [
                { path: 'models/orders.yml' },
                { path: 'models/refunds.yml' },
                { path: 'models/customers.yml' },
            ],
        } as Awaited<ReturnType<typeof getPullRequestDiffFiles>>);
        const url = 'https://github.com/acme/analytics/pull/7';
        expect(
            await source().updatePullRequest({
                organizationUuid: 'org',
                models,
                // The draft now only changes customers: orders goes back to main, and refunds, new in the pull request, goes away.
                writes: new Map([['customers', 'customers drafted']]),
                title: 'Update semantic layer: customers',
                prUrl: url,
            }),
        ).toEqual({ url });
        expect(createSignedCommitOnBranch).toHaveBeenCalledWith(
            expect.objectContaining({
                branch: 'lightdash-semantic-studio/abc',
                expectedHeadOid: 'head',
                fileChanges: {
                    additions: [
                        {
                            path: 'models/customers.yml',
                            contents: base64('customers drafted'),
                        },
                        {
                            path: 'models/orders.yml',
                            contents: base64('orders on main'),
                        },
                    ],
                    deletions: [{ path: 'models/refunds.yml' }],
                },
            }),
        );
    });

    it('is nothing for a pull request that closed, merged, or belongs to another repository', async () => {
        vi.mocked(createSignedCommitOnBranch).mockClear();
        const send = (prUrl: string) =>
            source().updatePullRequest({
                organizationUuid: 'org',
                models,
                writes: new Map([['orders', 'drafted']]),
                title: 'Update',
                prUrl,
            });
        vi.mocked(getPullRequest).mockResolvedValueOnce({
            merged: true,
            state: 'closed',
        } as Awaited<ReturnType<typeof getPullRequest>>);
        expect(
            await send('https://github.com/acme/analytics/pull/7'),
        ).toBeNull();
        expect(await send('https://github.com/other/repo/pull/7')).toBeNull();
        expect(createSignedCommitOnBranch).not.toHaveBeenCalled();
    });
});
