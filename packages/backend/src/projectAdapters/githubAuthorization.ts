import {
    DbtGithubProjectConfig,
    DbtProjectConfig,
    DbtProjectType,
    ParameterError,
} from '@lightdash/common';
import { getInstallationToken } from '../clients/github/Github';

export const GITHUB_APP_NOT_INSTALLED_MESSAGE =
    'This project is set to authenticate with the Lightdash GitHub App, but the app is not installed for your organization. Install it from Settings > Integrations > GitHub, or switch the project to a personal access token.';

/**
 * A connection that says "use the GitHub App" but has no installation to use
 * is an error, not a reason to try whatever PAT happens to be stored. Call
 * after the org-level installation has had a chance to fill the id in
 * (see applyCurrentGithubInstallationId).
 */
export const assertGithubInstallationResolved = (
    config: DbtProjectConfig,
): void => {
    if (
        config.type === DbtProjectType.GITHUB &&
        config.authorization_method === 'installation_id' &&
        !config.installation_id
    ) {
        throw new ParameterError(GITHUB_APP_NOT_INSTALLED_MESSAGE);
    }
};

/**
 * The credential the adapter should clone with. For a GitHub App connection
 * that is always a freshly minted installation token; a stored PAT is never
 * used as a fallback (PROD-11711).
 */
export const getGithubToken = async (
    config: DbtGithubProjectConfig,
): Promise<string | undefined> => {
    if (config.authorization_method !== 'installation_id') {
        return config.personal_access_token;
    }
    assertGithubInstallationResolved(config);
    return getInstallationToken(config.installation_id as string);
};
