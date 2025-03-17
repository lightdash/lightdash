import { DbtProjectType, DefaultSupportedDbtVersion } from '@lightdash/common';

export const githubDefaultValues = {
    type: DbtProjectType.GITHUB,
    environment: [],
    target: '',
    selector: '',
    repository: '',
    personal_access_token: '',
    installation_id: '',
    authorization_method: 'installation_id', // confirm
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
} as const;

export const dbtCloudIdeDefaultValues = {
    type: DbtProjectType.DBT_CLOUD_IDE,
    target: '',
    environment: [],
} as const;

// Local
export const dbtDefaultValues = {
    type: DbtProjectType.DBT,
    target: '',
    environment: [],
    selector: '',
} as const;

// CLI
export const noneDefaultValues = {
    type: DbtProjectType.NONE,
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
