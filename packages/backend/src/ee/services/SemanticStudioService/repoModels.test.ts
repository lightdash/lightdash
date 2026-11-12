import { DbtProjectType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { describePullRequest, resolveRepoConnection } from './repoModels';

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
