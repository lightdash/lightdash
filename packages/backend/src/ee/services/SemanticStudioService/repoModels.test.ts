import { DbtProjectType } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import {
    getInstallationAccessToken,
    getLastCommit,
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
    getLastCommit: vi.fn(async () => ({ sha: 'sha' })),
    getRepoTree: vi.fn(async () => ({ files: [], truncated: false })),
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
