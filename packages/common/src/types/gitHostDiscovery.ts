import assertUnreachable from '../utils/assertUnreachable';
import {
    DbtProjectType,
    type DbtAzureDevOpsProjectConfig,
    type DbtBitBucketProjectConfig,
    type DbtGithubProjectConfig,
    type DbtGitlabProjectConfig,
} from './projects';

export enum GitHost {
    GITHUB = 'github',
    GITLAB = 'gitlab',
    BITBUCKET = 'bitbucket',
    AZURE_DEVOPS = 'azure_devops',
}

export const GIT_HOST_ORDER: readonly GitHost[] = [
    GitHost.GITHUB,
    GitHost.GITLAB,
    GitHost.BITBUCKET,
    GitHost.AZURE_DEVOPS,
];

export const GIT_HOST_LABELS: Record<GitHost, string> = {
    [GitHost.GITHUB]: 'GitHub',
    [GitHost.GITLAB]: 'GitLab',
    [GitHost.BITBUCKET]: 'Bitbucket',
    [GitHost.AZURE_DEVOPS]: 'Azure DevOps',
};

export type GitHostCredentials =
    | { host: GitHost.GITHUB; method: 'installation' }
    | { host: GitHost.GITHUB; method: 'token'; token: string }
    | { host: GitHost.GITLAB; token: string; hostDomain: string | null }
    | {
          host: GitHost.BITBUCKET;
          username: string;
          token: string;
          hostDomain: string | null;
      }
    | { host: GitHost.AZURE_DEVOPS; organization: string; token: string };

export type GitHostRepository = {
    id: string;
    owner: string;
    name: string;
    fullName: string;
    azureProject: string | null;
    defaultBranch: string | null;
};

export enum SemanticLayerFormat {
    DBT = 'dbt',
    LIGHTDASH = 'lightdash',
    BOTH = 'both',
    NEITHER = 'neither',
}

export type ApiGitHostRepositoriesResponse = {
    status: 'ok';
    results: GitHostRepository[];
};

export type ApiGitHostBranchesResponse = {
    status: 'ok';
    results: string[];
};

export type ApiSemanticLayerFormatResponse = {
    status: 'ok';
    results: SemanticLayerFormat;
};

export const getSemanticLayerFormat = ({
    hasDbtProject,
    hasLightdashConfig,
}: {
    hasDbtProject: boolean;
    hasLightdashConfig: boolean;
}): SemanticLayerFormat => {
    if (hasDbtProject && hasLightdashConfig) return SemanticLayerFormat.BOTH;
    if (hasDbtProject) return SemanticLayerFormat.DBT;
    if (hasLightdashConfig) return SemanticLayerFormat.LIGHTDASH;
    return SemanticLayerFormat.NEITHER;
};

export const joinRepositoryPath = (subPath: string, fileName: string) => {
    const trimmed = subPath.replace(/^\/+|\/+$/g, '');
    return trimmed ? `${trimmed}/${fileName}` : fileName;
};

export enum GitHostCapability {
    CLONE = 'clone',
    PICKER = 'picker',
    EXTRA_SOURCES = 'extra_sources',
    NATIVE_YAML = 'native_yaml',
    WRITE_BACK = 'write_back',
    PR_PREVIEWS = 'pr_previews',
    PRIVATE_PACKAGES = 'private_packages',
    SUBDIRECTORIES = 'subdirectories',
    CA_AND_PROXY = 'ca_and_proxy',
}

export enum GitHostCapabilityStatus {
    SUPPORTED = 'supported',
    PLANNED = 'planned',
    NOT_SUPPORTED = 'not_supported',
}

export enum GitHostDeployment {
    CLOUD = 'cloud',
    SELF_MANAGED = 'self_managed',
}

export const GIT_HOST_CAPABILITY_LABELS: Record<GitHostCapability, string> = {
    [GitHostCapability.CLONE]: 'Connect and clone',
    [GitHostCapability.PICKER]: 'Repository and branch picker',
    [GitHostCapability.EXTRA_SOURCES]: 'Extra semantic layer connections',
    [GitHostCapability.NATIVE_YAML]: 'Native Lightdash YAML',
    [GitHostCapability.WRITE_BACK]: 'Write-back and pull requests',
    [GitHostCapability.PR_PREVIEWS]: 'Previews from pull requests',
    [GitHostCapability.PRIVATE_PACKAGES]: 'Private dbt packages',
    [GitHostCapability.SUBDIRECTORIES]: 'Project in a subdirectory',
    [GitHostCapability.CA_AND_PROXY]: 'Custom CA and proxy',
};

const S = GitHostCapabilityStatus.SUPPORTED;
const P = GitHostCapabilityStatus.PLANNED;
const N = GitHostCapabilityStatus.NOT_SUPPORTED;

type CapabilityRow = Record<GitHostCapability, GitHostCapabilityStatus>;

const row = (
    statuses: [
        clone: GitHostCapabilityStatus,
        picker: GitHostCapabilityStatus,
        extraSources: GitHostCapabilityStatus,
        nativeYaml: GitHostCapabilityStatus,
        writeBack: GitHostCapabilityStatus,
        prPreviews: GitHostCapabilityStatus,
        privatePackages: GitHostCapabilityStatus,
        subdirectories: GitHostCapabilityStatus,
        caAndProxy: GitHostCapabilityStatus,
    ],
): CapabilityRow => ({
    [GitHostCapability.CLONE]: statuses[0],
    [GitHostCapability.PICKER]: statuses[1],
    [GitHostCapability.EXTRA_SOURCES]: statuses[2],
    [GitHostCapability.NATIVE_YAML]: statuses[3],
    [GitHostCapability.WRITE_BACK]: statuses[4],
    [GitHostCapability.PR_PREVIEWS]: statuses[5],
    [GitHostCapability.PRIVATE_PACKAGES]: statuses[6],
    [GitHostCapability.SUBDIRECTORIES]: statuses[7],
    [GitHostCapability.CA_AND_PROXY]: statuses[8],
});

export const GIT_HOST_CAPABILITY_MATRIX: Record<
    GitHost,
    Record<GitHostDeployment, CapabilityRow>
> = {
    [GitHost.GITHUB]: {
        [GitHostDeployment.CLOUD]: row([S, S, S, S, S, S, S, S, P]),
        [GitHostDeployment.SELF_MANAGED]: row([S, P, S, S, P, P, S, S, P]),
    },
    [GitHost.GITLAB]: {
        [GitHostDeployment.CLOUD]: row([S, S, P, P, S, P, P, S, P]),
        [GitHostDeployment.SELF_MANAGED]: row([S, S, P, P, S, P, P, S, P]),
    },
    [GitHost.BITBUCKET]: {
        [GitHostDeployment.CLOUD]: row([S, S, P, S, S, P, P, S, P]),
        [GitHostDeployment.SELF_MANAGED]: row([S, P, P, N, N, P, P, S, P]),
    },
    [GitHost.AZURE_DEVOPS]: {
        [GitHostDeployment.CLOUD]: row([S, S, P, P, N, N, P, S, P]),
        [GitHostDeployment.SELF_MANAGED]: row([N, N, N, N, N, N, N, N, N]),
    },
};

const TILE_LABEL_CAPABILITIES: readonly GitHostCapability[] = [
    GitHostCapability.WRITE_BACK,
    GitHostCapability.PR_PREVIEWS,
    GitHostCapability.EXTRA_SOURCES,
    GitHostCapability.NATIVE_YAML,
];

const toListItem = (label: string) =>
    label.charAt(0).toLowerCase() + label.slice(1);

export const getGitHostTileLabels = (host: GitHost): string[] => {
    const cloud = GIT_HOST_CAPABILITY_MATRIX[host][GitHostDeployment.CLOUD];
    const notOnHost: string[] = [];
    const notYet: string[] = [];
    TILE_LABEL_CAPABILITIES.forEach((capability) => {
        const label = toListItem(GIT_HOST_CAPABILITY_LABELS[capability]);
        switch (cloud[capability]) {
            case GitHostCapabilityStatus.SUPPORTED:
                return;
            case GitHostCapabilityStatus.PLANNED:
                notYet.push(label);
                return;
            case GitHostCapabilityStatus.NOT_SUPPORTED:
                notOnHost.push(label);
                return;
            default:
                assertUnreachable(
                    cloud[capability],
                    'Unknown capability status',
                );
        }
    });
    return [
        ...(notOnHost.length > 0
            ? [`Not on ${GIT_HOST_LABELS[host]}: ${notOnHost.join(', ')}`]
            : []),
        ...(notYet.length > 0
            ? [`Not available yet: ${notYet.join(', ')}`]
            : []),
    ];
};

const BITBUCKET_CLOUD_HOST = 'bitbucket.org';

export const supportsNativeLightdashYaml = (
    credentials: GitHostCredentials,
): boolean => {
    switch (credentials.host) {
        case GitHost.GITHUB:
            return true;
        case GitHost.BITBUCKET:
            return (
                credentials.hostDomain === null ||
                credentials.hostDomain === BITBUCKET_CLOUD_HOST
            );
        case GitHost.GITLAB:
        case GitHost.AZURE_DEVOPS:
            return false;
        default:
            return assertUnreachable(credentials, 'Unknown git host');
    }
};

export type GitDbtConnection =
    | DbtGithubProjectConfig
    | DbtGitlabProjectConfig
    | DbtBitBucketProjectConfig
    | DbtAzureDevOpsProjectConfig;

export const buildGitDbtConnection = ({
    credentials,
    repository,
    branch,
    subPath,
    semanticLayer,
    githubInstallationId,
}: {
    credentials: GitHostCredentials;
    repository: Pick<GitHostRepository, 'fullName' | 'name' | 'azureProject'>;
    branch: string;
    subPath: string;
    semanticLayer: 'dbt' | 'lightdash';
    githubInstallationId: string | null;
}): GitDbtConnection => {
    const projectSubPath = subPath.trim() || '/';
    switch (credentials.host) {
        case GitHost.GITHUB:
            return credentials.method === 'installation'
                ? {
                      type: DbtProjectType.GITHUB,
                      authorization_method: 'installation_id',
                      installation_id: githubInstallationId ?? undefined,
                      repository: repository.fullName,
                      branch,
                      project_sub_path: projectSubPath,
                      semanticLayer,
                  }
                : {
                      type: DbtProjectType.GITHUB,
                      authorization_method: 'personal_access_token',
                      personal_access_token: credentials.token,
                      repository: repository.fullName,
                      branch,
                      project_sub_path: projectSubPath,
                      semanticLayer,
                  };
        case GitHost.GITLAB:
            return {
                type: DbtProjectType.GITLAB,
                personal_access_token: credentials.token,
                repository: repository.fullName,
                branch,
                project_sub_path: projectSubPath,
                ...(credentials.hostDomain
                    ? { host_domain: credentials.hostDomain }
                    : {}),
            };
        case GitHost.BITBUCKET:
            return {
                type: DbtProjectType.BITBUCKET,
                username: credentials.username,
                personal_access_token: credentials.token,
                repository: repository.fullName,
                branch,
                project_sub_path: projectSubPath,
                semanticLayer,
                ...(credentials.hostDomain
                    ? { host_domain: credentials.hostDomain }
                    : {}),
            };
        case GitHost.AZURE_DEVOPS:
            return {
                type: DbtProjectType.AZURE_DEVOPS,
                personal_access_token: credentials.token,
                organization: credentials.organization,
                project: repository.azureProject ?? '',
                repository: repository.name,
                branch,
                project_sub_path: projectSubPath,
            };
        default:
            return assertUnreachable(credentials, 'Unknown git host');
    }
};
