import { DbtProjectConfig, DbtProjectType } from '@lightdash/common';
import { applyCurrentGithubInstallationId } from './resolveGithubInstallationId';

const githubInstallationConnection = {
    type: DbtProjectType.GITHUB,
    authorization_method: 'installation_id',
    installation_id: 'stale-installation-id',
    repository: 'my-org/data-dbt',
    branch: 'main',
    project_sub_path: '/',
} as DbtProjectConfig;

describe('applyCurrentGithubInstallationId', () => {
    it('replaces a stale installation_id with the current org-level one', () => {
        const result = applyCurrentGithubInstallationId(
            githubInstallationConnection,
            'fresh-installation-id',
        );

        expect(result).toEqual({
            ...githubInstallationConnection,
            installation_id: 'fresh-installation-id',
        });
    });

    it('returns the same connection when the installation_id already matches', () => {
        const result = applyCurrentGithubInstallationId(
            githubInstallationConnection,
            'stale-installation-id',
        );

        expect(result).toBe(githubInstallationConnection);
    });

    it('returns the same connection when there is no current installation', () => {
        const result = applyCurrentGithubInstallationId(
            githubInstallationConnection,
            undefined,
        );

        expect(result).toBe(githubInstallationConnection);
    });

    it('does not touch personal access token GitHub connections', () => {
        const patConnection = {
            ...githubInstallationConnection,
            authorization_method: 'personal_access_token',
            personal_access_token: 'pat',
            installation_id: undefined,
        } as DbtProjectConfig;

        const result = applyCurrentGithubInstallationId(
            patConnection,
            'fresh-installation-id',
        );

        expect(result).toBe(patConnection);
    });

    it('does not touch non-GitHub connections', () => {
        const noneConnection = {
            type: DbtProjectType.NONE,
        } as DbtProjectConfig;

        const result = applyCurrentGithubInstallationId(
            noneConnection,
            'fresh-installation-id',
        );

        expect(result).toBe(noneConnection);
    });
});
