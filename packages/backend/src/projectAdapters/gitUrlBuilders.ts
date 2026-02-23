import { validateGithubToken } from '@lightdash/common';
import { GitUrlBuilder, GitUrlParams } from './types';

const DEFAULT_GITHUB_HOST = 'github.com';
const DEFAULT_GITLAB_HOST = 'gitlab.com';
const DEFAULT_BITBUCKET_HOST = 'bitbucket.org';
const AZURE_DEVOPS_HOST = 'dev.azure.com';

/**
 * Build a git URL for GitHub repositories.
 * Supports custom host domains for GitHub Enterprise.
 *
 * @example
 * githubUrlBuilder({ token: 'ghp_xxx', repository: 'org/repo' })
 * // => 'https://lightdash:ghp_xxx@github.com/org/repo.git'
 *
 * githubUrlBuilder({ token: 'ghp_xxx', repository: 'org/repo', host: 'github.mycompany.com' })
 * // => 'https://lightdash:ghp_xxx@github.mycompany.com/org/repo.git'
 */
export const githubUrlBuilder: GitUrlBuilder = ({
    token,
    repository,
    host = DEFAULT_GITHUB_HOST,
}: GitUrlParams): string => {
    const [isValid, error] = validateGithubToken(token);
    if (!isValid) {
        throw new Error(error);
    }
    return `https://lightdash:${token}@${host}/${repository}.git`;
};

/**
 * Build a git URL for GitLab repositories.
 * Supports custom host domains for self-hosted GitLab.
 *
 * @example
 * gitlabUrlBuilder({ token: 'glpat-xxx', repository: 'org/repo' })
 * // => 'https://lightdash:glpat-xxx@gitlab.com/org/repo.git'
 */
export const gitlabUrlBuilder: GitUrlBuilder = ({
    token,
    repository,
    host = DEFAULT_GITLAB_HOST,
}: GitUrlParams): string =>
    `https://lightdash:${token}@${host}/${repository}.git`;

/**
 * Build a git URL for Bitbucket repositories.
 * Requires username in addition to token.
 * Supports custom host domains for Bitbucket Server.
 *
 * @example
 * bitbucketUrlBuilder({ token: 'xxx', repository: 'org/repo', username: 'user' })
 * // => 'https://user:xxx@bitbucket.org/org/repo.git'
 */
export const bitbucketUrlBuilder: GitUrlBuilder = ({
    token,
    repository,
    host = DEFAULT_BITBUCKET_HOST,
    username,
}: GitUrlParams): string => {
    if (!username) {
        throw new Error('Bitbucket requires a username');
    }
    return `https://${username}:${token}@${host}/${repository}.git`;
};

/**
 * Build a git URL for Azure DevOps repositories.
 * Requires organization and project in addition to repository name.
 * Always uses dev.azure.com as the host.
 *
 * @example
 * azureDevOpsUrlBuilder({
 *   token: 'xxx',
 *   repository: 'my-repo',
 *   organization: 'my-org',
 *   project: 'my-project'
 * })
 * // => 'https://xxx@dev.azure.com/my-org/my-project/_git/my-repo'
 */
export const azureDevOpsUrlBuilder: GitUrlBuilder = ({
    token,
    repository,
    organization,
    project,
}: GitUrlParams): string => {
    if (!organization) {
        throw new Error('Azure DevOps requires an organization');
    }
    if (!project) {
        throw new Error('Azure DevOps requires a project');
    }
    return `https://${token}@${AZURE_DEVOPS_HOST}/${organization}/${project}/_git/${repository}`;
};

/**
 * Git provider types that match DbtProjectType values
 */
export type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'azure_devops';

/**
 * Get the appropriate URL builder for a git provider
 */
export const getGitUrlBuilder = (provider: GitProvider): GitUrlBuilder => {
    switch (provider) {
        case 'github':
            return githubUrlBuilder;
        case 'gitlab':
            return gitlabUrlBuilder;
        case 'bitbucket':
            return bitbucketUrlBuilder;
        case 'azure_devops':
            return azureDevOpsUrlBuilder;
        default:
            throw new Error(`Unknown git provider: ${provider}`);
    }
};
