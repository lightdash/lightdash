import {
    DbtProjectType,
    getInvalidDbtEnvironmentVariableKeys,
    validateDbtSelector,
    type DbtProjectEnvironmentVariable,
} from '@lightdash/common';
import i18n from '../../../i18n/i18n';
import {
    everyValidator,
    hasNoWhiteSpaces,
    isGitRepository,
    startWithSlash,
} from '../../../utils/fieldValidators';
import type { ProjectConnectionForm } from '../types';

const tDbt = (key: string, options?: Record<string, unknown>) =>
    i18n.t(`dbtValidators.${key}`, { ns: 'projectConnection', ...options });

// Saving "OAuth" without an installation used to persist an empty
// installation id, which the backend then served from a stale PAT
// (PROD-11711). Block it here so the user sees why.
const installationIdValidator = (
    value: unknown,
    values: ProjectConnectionForm,
): string | undefined => {
    const dbt = values?.dbt;
    if (!dbt || dbt.type !== DbtProjectType.GITHUB) return undefined;
    if (dbt.authorization_method !== 'installation_id') return undefined;
    if (value) return undefined;
    return tDbt('githubAppNotConnected');
};

const selectorValidator = (value?: string) => {
    if (!value) return;
    if (value === '' || validateDbtSelector(value)) return;

    return tDbt('selectorInvalid');
};

const environmentValidator = (
    value?: DbtProjectEnvironmentVariable[],
): string | undefined => {
    const invalidKeys = getInvalidDbtEnvironmentVariableKeys(value);
    if (invalidKeys.length === 0) return undefined;

    return tDbt('environmentInvalid', { keys: invalidKeys.join(', ') });
};

const discoveryApiEndpointValidator = (value?: string): string | undefined => {
    if (!value) return undefined;
    if (value.includes('semantic-layer')) {
        return tDbt('discoveryEndpointInvalid');
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
    installation_id: installationIdValidator,
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
