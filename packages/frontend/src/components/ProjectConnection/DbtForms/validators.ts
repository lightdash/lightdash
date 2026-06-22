import {
    getInvalidDbtEnvironmentVariableKeys,
    validateDbtSelector,
    type DbtProjectEnvironmentVariable,
} from '@lightdash/common';
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

const environmentValidator = (
    value?: DbtProjectEnvironmentVariable[],
): string | undefined => {
    const invalidKeys = getInvalidDbtEnvironmentVariableKeys(value);
    if (invalidKeys.length === 0) return undefined;

    return `Environment variable keys cannot change how dbt or its child processes execute. Invalid keys: ${invalidKeys.join(
        ', ',
    )}`;
};

const discoveryApiEndpointValidator = (value?: string): string | undefined => {
    if (!value) return undefined;
    if (value.includes('semantic-layer')) {
        return 'This looks like the Semantic Layer endpoint. Use the Discovery API endpoint instead (e.g. https://metadata.cloud.getdbt.com/graphql).';
    }
    return undefined;
};

export const dbtFormValidators = {
    api_key: hasNoWhiteSpaces('API Key'),
    environment_id: hasNoWhiteSpaces('Environment ID'),
    discovery_api_endpoint: discoveryApiEndpointValidator,
    environment: environmentValidator,
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
