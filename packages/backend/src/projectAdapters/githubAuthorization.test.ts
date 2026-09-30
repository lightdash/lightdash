import {
    DbtProjectType,
    ParameterError,
    type DbtGithubProjectConfig,
} from '@lightdash/common';
import { getInstallationToken } from '../clients/github/Github';
import {
    assertGithubInstallationResolved,
    getGithubToken,
    GITHUB_APP_NOT_INSTALLED_MESSAGE,
} from './githubAuthorization';

vi.mock('../clients/github/Github', () => ({
    getInstallationToken: vi.fn(),
}));

const patConnection: DbtGithubProjectConfig = {
    type: DbtProjectType.GITHUB,
    authorization_method: 'personal_access_token',
    personal_access_token: 'ghp_saved',
    repository: 'org/repo',
    branch: 'main',
    project_sub_path: '/',
};

const oauthConnection: DbtGithubProjectConfig = {
    ...patConnection,
    authorization_method: 'installation_id',
    installation_id: '66063296',
};

describe('getGithubToken', () => {
    beforeEach(() => vi.mocked(getInstallationToken).mockReset());

    test('mints an installation token for a GitHub App connection', async () => {
        vi.mocked(getInstallationToken).mockResolvedValue('ghs_minted');
        await expect(getGithubToken(oauthConnection)).resolves.toBe(
            'ghs_minted',
        );
        expect(getInstallationToken).toHaveBeenCalledWith('66063296');
    });

    test('throws instead of using a stored PAT when the GitHub App connection has no installation id', async () => {
        await expect(
            getGithubToken({ ...oauthConnection, installation_id: '' }),
        ).rejects.toThrow(GITHUB_APP_NOT_INSTALLED_MESSAGE);
        expect(getInstallationToken).not.toHaveBeenCalled();
    });

    test('uses the PAT for a personal_access_token connection', async () => {
        await expect(getGithubToken(patConnection)).resolves.toBe('ghp_saved');
        expect(getInstallationToken).not.toHaveBeenCalled();
    });

    test('returns undefined for a PAT connection with no token', async () => {
        await expect(
            getGithubToken({
                ...patConnection,
                personal_access_token: undefined,
            }),
        ).resolves.toBeUndefined();
    });
});

describe('assertGithubInstallationResolved', () => {
    test('throws a ParameterError for an OAuth connection with an empty installation id', () => {
        expect(() =>
            assertGithubInstallationResolved({
                ...oauthConnection,
                installation_id: '',
            }),
        ).toThrow(ParameterError);
    });

    test('does not throw once the org installation has been applied', () => {
        expect(() =>
            assertGithubInstallationResolved(oauthConnection),
        ).not.toThrow();
    });

    test('ignores PAT and non-GitHub connections', () => {
        expect(() =>
            assertGithubInstallationResolved(patConnection),
        ).not.toThrow();
        expect(() =>
            assertGithubInstallationResolved({
                type: DbtProjectType.GITLAB,
                personal_access_token: 'x',
                repository: 'org/repo',
                branch: 'main',
                project_sub_path: '/',
            }),
        ).not.toThrow();
    });
});
