import { validateDbtSelector } from '@lightdash/common';
import {
    everyValidator,
    hasNoWhiteSpaces,
    isGitRepository,
    startWithSlash,
} from '../../../utils/fieldValidators';

const selectorValidator = (value?: string) => {
    if (!value) return;
    if (value === '' || validateDbtSelector(value)) return;

    return 'dbt selector is invalid';
};

export const dbtFormValidators = {
    api_key: hasNoWhiteSpaces('API Key'),
    environment_id: hasNoWhiteSpaces('Environment ID'),
    selector: selectorValidator,
    // TODO :: improve this for github to detect the prefix
    // @mantine/form@7.5.2 doesn't support replacing validators after initialization
    personal_access_token: hasNoWhiteSpaces('Personal access token'),
    repository: everyValidator('Repository', hasNoWhiteSpaces, isGitRepository),
    branch: hasNoWhiteSpaces('Branch'),
    project_sub_path: everyValidator(
        'Project directory path',
        hasNoWhiteSpaces,
        startWithSlash,
    ),
    host_domain: hasNoWhiteSpaces('Host domain'),
    username: hasNoWhiteSpaces('Username'),
    organization: hasNoWhiteSpaces('Organization'),
    project: hasNoWhiteSpaces('Project'),
};
