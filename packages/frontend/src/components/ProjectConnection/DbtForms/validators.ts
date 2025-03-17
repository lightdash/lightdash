import { DbtProjectType, validateDbtSelector } from '@lightdash/common';

const selectorValidator = (value?: string) => {
    if (!value) return;
    if (value === '' || validateDbtSelector(value)) return;

    return 'dbt selector is invalid';
};

export const dbtFormValidators = {
    [DbtProjectType.DBT_CLOUD_IDE]: {},
    [DbtProjectType.DBT]: {
        selector: selectorValidator,
    },
    [DbtProjectType.GITHUB]: {
        selector: selectorValidator,
    },
    [DbtProjectType.GITLAB]: {
        selector: selectorValidator,
    },
    [DbtProjectType.BITBUCKET]: {
        selector: selectorValidator,
    },
    [DbtProjectType.AZURE_DEVOPS]: {
        selector: selectorValidator,
    },
    [DbtProjectType.NONE]: {},
} as const;
