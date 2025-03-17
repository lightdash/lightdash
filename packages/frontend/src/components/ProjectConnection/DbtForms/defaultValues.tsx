import { DbtProjectType, DefaultSupportedDbtVersion } from '@lightdash/common';

const githubDefaultValues = {
    type: DbtProjectType.GITHUB,
    environment: [],
    selector: '',
} as const;

const gitlabDefaultValues = {
    type: DbtProjectType.GITLAB,
    environment: [],
    selector: '',
} as const;

const bitbucketDefaultValues = {
    type: DbtProjectType.BITBUCKET,
    environment: [],
    selector: '',
} as const;

const azureDevopsDefaultValues = {
    type: DbtProjectType.AZURE_DEVOPS,
    environment: [],
    selector: '',
} as const;

const dbtCloudIdeDefaultValues = {
    type: DbtProjectType.DBT_CLOUD_IDE,
    environment: [],
} as const;

// Local
const dbtDefaultValues = {
    type: DbtProjectType.DBT,
    environment: [],
    selector: '',
} as const;

// CLI
const noneDefaultValues = {
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
