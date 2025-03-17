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
        project_sub_path: everyValidator(
            'Project directory path',
            hasNoWhiteSpaces,
            startWithSlash,
        ),
    },
    [DbtProjectType.GITLAB]: {
        selector: selectorValidator,
        repository: everyValidator(
            'Repository',
            hasNoWhiteSpaces,
            isGitRepository,
        ),
        branch: hasNoWhiteSpaces('Branch'),
        project_sub_path: everyValidator(
            'Project directory path',
            hasNoWhiteSpaces,
            startWithSlash,
        ),
        host_domain: hasNoWhiteSpaces('Host domain'),
    },
    [DbtProjectType.BITBUCKET]: {
        selector: selectorValidator,
        username: hasNoWhiteSpaces('Username'),
        repository: everyValidator(
            'Repository',
            hasNoWhiteSpaces,
            isGitRepository,
        ),
        branch: hasNoWhiteSpaces('Branch'),
        project_sub_path: everyValidator(
            'Project directory path',
            hasNoWhiteSpaces,
            startWithSlash,
        ),
        host_domain: hasNoWhiteSpaces('Host domain'),
    },
    [DbtProjectType.AZURE_DEVOPS]: {
        selector: selectorValidator,
        organization: hasNoWhiteSpaces('Organization'),
        project: hasNoWhiteSpaces('Project'),
        repository: hasNoWhiteSpaces('Repository'),
        branch: hasNoWhiteSpaces('Branch'),
        project_sub_path: everyValidator(
            'Project directory path',
            hasNoWhiteSpaces,
            startWithSlash,
        ),
    },
    [DbtProjectType.NONE]: {},
} as const;
