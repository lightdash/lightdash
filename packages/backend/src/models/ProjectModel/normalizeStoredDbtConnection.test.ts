import {
    DbtProjectType,
    type DbtGithubProjectConfig,
    type DbtProjectConfig,
} from '@lightdash/common';
import { normalizeStoredDbtConnection } from './normalizeStoredDbtConnection';

// A row saved before the GitHub App existed: no authorization_method at all.
const legacyGithub = {
    type: DbtProjectType.GITHUB,
    repository: 'org/repo',
    branch: 'main',
    project_sub_path: '/',
} as unknown as DbtGithubProjectConfig;

describe('normalizeStoredDbtConnection', () => {
    test('reads a legacy GitHub row with a PAT as personal_access_token', () => {
        const result = normalizeStoredDbtConnection({
            ...legacyGithub,
            personal_access_token: 'ghp_saved',
        });
        expect(result).toEqual({
            ...legacyGithub,
            personal_access_token: 'ghp_saved',
            authorization_method: 'personal_access_token',
        });
    });

    test('infers installation_id when only an installation id is stored', () => {
        const result = normalizeStoredDbtConnection({
            ...legacyGithub,
            installation_id: '123',
        });
        expect(result).toMatchObject({
            authorization_method: 'installation_id',
        });
    });

    test('keeps an explicit authorization_method, even with both credentials stored', () => {
        const config: DbtGithubProjectConfig = {
            ...legacyGithub,
            authorization_method: 'installation_id',
            installation_id: '123',
            personal_access_token: 'ghp_stale',
        };
        expect(normalizeStoredDbtConnection(config)).toBe(config);
    });

    test('returns non-GitHub connections untouched', () => {
        const config: DbtProjectConfig = {
            type: DbtProjectType.GITLAB,
            personal_access_token: 'glpat',
            repository: 'org/repo',
            branch: 'main',
            project_sub_path: '/',
        };
        expect(normalizeStoredDbtConnection(config)).toBe(config);
    });
});
