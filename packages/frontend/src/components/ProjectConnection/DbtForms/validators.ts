import { DbtProjectType, validateDbtSelector } from '@lightdash/common';
import {
    everyValidator,
    hasNoWhiteSpaces,
    isGitRepository,
    isValidGithubToken,
    startWithSlash,
} from '../../../utils/fieldValidators';

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
        personal_access_token: everyValidator(
            'Personal access token',
            hasNoWhiteSpaces,
            isValidGithubToken,
        ),
        repository: everyValidator(
            'Repository',
            hasNoWhiteSpaces,
            isGitRepository,
        ),
        branch: hasNoWhiteSpaces('Branch'),
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
