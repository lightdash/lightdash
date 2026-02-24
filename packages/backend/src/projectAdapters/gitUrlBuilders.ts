/**
 * Pure functions to build authenticated Git remote URLs for different providers.
 * Extracted from provider-specific adapter classes for reuse and testability.
 */

const DEFAULT_GITHUB_HOST_DOMAIN = 'github.com';
const DEFAULT_GITLAB_HOST_DOMAIN = 'gitlab.com';
const DEFAULT_BITBUCKET_HOST_DOMAIN = 'bitbucket.org';

export type GithubUrlBuilderArgs = {
    token: string;
    repository: string;
    hostDomain?: string;
};

export type GitlabUrlBuilderArgs = {
    token: string;
    repository: string;
    hostDomain?: string;
};

export type BitbucketUrlBuilderArgs = {
    username: string;
    token: string;
    repository: string;
    hostDomain?: string;
};

export type AzureDevOpsUrlBuilderArgs = {
    token: string;
    organization: string;
    project: string;
    repository: string;
};

export function githubUrlBuilder({
    token,
    repository,
    hostDomain,
}: GithubUrlBuilderArgs): string {
    return `https://lightdash:${token}@${
        hostDomain || DEFAULT_GITHUB_HOST_DOMAIN
    }/${repository}.git`;
}

export function gitlabUrlBuilder({
    token,
    repository,
    hostDomain,
}: GitlabUrlBuilderArgs): string {
    return `https://lightdash:${token}@${
        hostDomain || DEFAULT_GITLAB_HOST_DOMAIN
    }/${repository}.git`;
}

export function bitbucketUrlBuilder({
    username,
    token,
    repository,
    hostDomain,
}: BitbucketUrlBuilderArgs): string {
    return `https://${username}:${token}@${
        hostDomain || DEFAULT_BITBUCKET_HOST_DOMAIN
    }/${repository}.git`;
}

export function azureDevOpsUrlBuilder({
    token,
    organization,
    project,
    repository,
}: AzureDevOpsUrlBuilderArgs): string {
    return `https://${token}@dev.azure.com/${organization}/${project}/_git/${repository}`;
}
