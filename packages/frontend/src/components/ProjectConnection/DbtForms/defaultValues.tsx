import { DbtProjectType, DefaultSupportedDbtVersion } from '@lightdash/common';

export const githubDefaultValues = {
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

export const gitlabDefaultValues = {
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

export const bitbucketDefaultValues = {
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

export const azureDevopsDefaultValues = {
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

const dbtCloudIdeDefaultValues = {
    type: DbtProjectType.DBT_CLOUD_IDE,
    target: '',
    environment: [],
    api_key: '',
    environment_id: '',
    discovery_api_endpoint: '',
    tags: [],
} as const;

// Local
const dbtDefaultValues = {
    type: DbtProjectType.DBT,
    target: '',
    environment: [],
    selector: '',
} as const;

// CLI
const noneDefaultValues = {
    type: DbtProjectType.NONE,
    hideRefreshButton: false, // confirm
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
    } as const,
} as const;
