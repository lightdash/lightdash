const GITHUB_REPO_URL = 'https://github.com/lightdash/lightdash';

export const UPDATE_LIGHTDASH_DOCS_URL =
    'https://docs.lightdash.com/self-host/update-lightdash';

export const RELEASE_NOTES_URL = `${GITHUB_REPO_URL}/releases`;

// Release tags have no "v" prefix, so the compare view resolves both versions.
export const getChangesSinceVersionUrl = (
    currentVersion: string,
    latestVersion: string,
): string =>
    `${GITHUB_REPO_URL}/compare/${encodeURIComponent(
        currentVersion,
    )}...${encodeURIComponent(latestVersion)}`;
