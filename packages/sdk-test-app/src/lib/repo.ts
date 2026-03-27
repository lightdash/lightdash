const LIGHTDASH_REPO_BASE_URL =
    'https://github.com/lightdash/lightdash/blob/main';

export const getRepoSourceUrl = (sourcePath: string) =>
    `${LIGHTDASH_REPO_BASE_URL}/${sourcePath}`;
