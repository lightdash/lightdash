import {
    type DbtAzureDevOpsProjectConfig,
    type DbtBitBucketProjectConfig,
    type DbtCloudIDEProjectConfig,
    type DbtGithubProjectConfig,
    type DbtGitlabProjectConfig,
    type DbtLocalProjectConfig,
    type DbtNoneProjectConfig,
    DbtProjectType,
    DefaultSupportedDbtVersion,
} from '@lightdash/common';
import { type DbtManifestProjectConfig } from '@lightdash/common/src';

export const githubDefaultValues: DbtGithubProjectConfig = {
    type: DbtProjectType.GITHUB,
    environment: [],
    target: '',
    selector: '',
    repository: '',
    personal_access_token: '',
    installation_id: '',
    authorization_method: 'installation_id',
    branch: 'main',
    project_sub_path: '/',
    host_domain: 'github.com',
} as const;

export const gitlabDefaultValues: DbtGitlabProjectConfig = {
    type: DbtProjectType.GITLAB,
    target: '',
    environment: [],
    selector: '',
    personal_access_token: '',
    repository: '',
    branch: 'main',
    project_sub_path: '/',
    host_domain: 'gitlab.com',
} as const;

export const bitbucketDefaultValues: DbtBitBucketProjectConfig = {
    type: DbtProjectType.BITBUCKET,
    target: '',
    environment: [],
    selector: '',
    username: '',
    personal_access_token: '',
    repository: '',
    branch: 'main',
    project_sub_path: '/',
    host_domain: 'bitbucket.org',
} as const;

export const azureDevopsDefaultValues: DbtAzureDevOpsProjectConfig = {
    type: DbtProjectType.AZURE_DEVOPS,
    target: '',
    environment: [],
    selector: '',
    personal_access_token: '',
    organization: '',
    project: '',
    repository: '',
    branch: 'main',
    project_sub_path: '/',
} as const;

const dbtCloudIdeDefaultValues: DbtCloudIDEProjectConfig = {
    type: DbtProjectType.DBT_CLOUD_IDE,
    api_key: '',
    environment_id: '',
    discovery_api_endpoint: '',
    tags: [],
} as const;

// Local
const dbtDefaultValues: DbtLocalProjectConfig = {
    type: DbtProjectType.DBT,
    target: '',
    environment: [],
    selector: '',
} as const;

// CLI
const noneDefaultValues: DbtNoneProjectConfig = {
    type: DbtProjectType.NONE,
    hideRefreshButton: false,
} as const;

const manifestDefaultValues: DbtManifestProjectConfig = {
    type: DbtProjectType.MANIFEST,
    manifest: '',
    hideRefreshButton: false,
} as const;

export const dbtDefaults = {
    dbtVersion: DefaultSupportedDbtVersion,
    dbtType: DbtProjectType.GITHUB,
    formValues: {
        [DbtProjectType.DBT]: dbtDefaultValues,
        [DbtProjectType.GITHUB]: githubDefaultValues,
        [DbtProjectType.GITLAB]: gitlabDefaultValues,
        [DbtProjectType.BITBUCKET]: bitbucketDefaultValues,
        [DbtProjectType.AZURE_DEVOPS]: azureDevopsDefaultValues,
        [DbtProjectType.DBT_CLOUD_IDE]: dbtCloudIdeDefaultValues,
        [DbtProjectType.NONE]: noneDefaultValues,
        [DbtProjectType.MANIFEST]: manifestDefaultValues,
    } as const,
} as const;
