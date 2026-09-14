import Logger from '../logging/logger';

// PATH is load bearing: getDbtExec returns bare command names and on Linux the
// lookup happens in the child against the environment we build here. The proxy
// and CA settings are for `dbt deps` reaching hub.getdbt.com or cloning git
// packages. Both cases are listed because tools disagree: curl ignores
// uppercase HTTP_PROXY, python reads lowercase first.
const RUNTIME_ENVIRONMENT_VARIABLE_KEYS = [
    'PATH',
    'HOME',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'TZ',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'no_proxy',
    'all_proxy',
    'REQUESTS_CA_BUNDLE',
    'CURL_CA_BUNDLE',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
];

// Credential chains, for warehouses whose adapter authenticates from the host
// rather than from the generated profiles.yml. Exact names rather than
// prefixes, since an AWS_ or AZURE_ prefix would also share Lightdash's own
// AZURE_AI_API_KEY and friends.
const CLOUD_CREDENTIAL_ENVIRONMENT_VARIABLE_KEYS = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_ROLE_ARN',
    'AWS_ROLE_SESSION_NAME',
    'AWS_WEB_IDENTITY_TOKEN_FILE',
    'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
    'AWS_CONTAINER_CREDENTIALS_FULL_URI',
    'AWS_CONTAINER_AUTHORIZATION_TOKEN',
    'AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE',
    'AWS_PROFILE',
    'AWS_DEFAULT_PROFILE',
    'AWS_SHARED_CREDENTIALS_FILE',
    'AWS_CONFIG_FILE',
    'AWS_REGION', // botocore prefers this one
    'AWS_DEFAULT_REGION', // the AWS SDK used by DuckDB prefers this one
    'AWS_CA_BUNDLE',
    'AWS_STS_REGIONAL_ENDPOINTS',
    'AWS_EC2_METADATA_DISABLED',
    'AWS_EC2_METADATA_SERVICE_ENDPOINT',
    'AWS_METADATA_SERVICE_TIMEOUT',
    'AWS_METADATA_SERVICE_NUM_ATTEMPTS',
    'AWS_ENDPOINT_URL',
    'AWS_ENDPOINT_URL_S3',
    'AWS_ENDPOINT_URL_STS',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'CLOUDSDK_CONFIG',
    'GOOGLE_CLOUD_PROJECT',
    'GCLOUD_PROJECT',
    'GOOGLE_CLOUD_QUOTA_PROJECT',
    'GCE_METADATA_HOST',
    'GCE_METADATA_IP',
    'GCE_METADATA_ROOT',
    'NO_GCE_CHECK',
    'AZURE_TENANT_ID',
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_CLIENT_CERTIFICATE_PATH',
    'AZURE_CLIENT_CERTIFICATE_PASSWORD',
    'AZURE_FEDERATED_TOKEN_FILE',
    'AZURE_AUTHORITY_HOST',
    'MSI_ENDPOINT',
    'MSI_SECRET',
    'IDENTITY_ENDPOINT',
    'IDENTITY_HEADER',
    'IMDS_ENDPOINT',
];

type DbtProcessEnvironmentArgs = {
    processEnvironment: NodeJS.ProcessEnv;
    environmentVariableAllowlist: string[];
    projectEnvironment: Record<string, string>;
    targetPath: string;
    gitConfigGlobalPath?: string;
};

const inheritKeys = (
    processEnvironment: NodeJS.ProcessEnv,
    keys: string[],
): Record<string, string> =>
    keys.reduce<Record<string, string>>((acc, key) => {
        const value = processEnvironment[key];
        return value === undefined ? acc : { ...acc, [key]: value };
    }, {});

export const getDbtProcessEnvironment = ({
    processEnvironment,
    environmentVariableAllowlist,
    projectEnvironment,
    targetPath,
    gitConfigGlobalPath,
}: DbtProcessEnvironmentArgs): Record<string, string> => ({
    // Ambient cloud credentials sit below the project, because profiles.ts
    // injects the warehouse's own AWS_* keys through projectEnvironment and
    // those must beat whatever identity the host happens to carry.
    ...inheritKeys(
        processEnvironment,
        CLOUD_CREDENTIAL_ENVIRONMENT_VARIABLE_KEYS,
    ),
    ...inheritKeys(processEnvironment, environmentVariableAllowlist),
    ...projectEnvironment,
    // Runtime plumbing sits above it: PATH decides which binary runs, and the
    // proxy and CA settings decide where dbt deps fetches from, so a project
    // cannot redirect either.
    ...inheritKeys(processEnvironment, RUNTIME_ENVIRONMENT_VARIABLE_KEYS),
    DBT_PARTIAL_PARSE: 'false', // Disable dbt from storing manifest and doing partial parses. https://docs.getdbt.com/reference/parsing#partial-parsing
    DBT_SEND_ANONYMOUS_USAGE_STATS: 'false', // Disable sending usage stats. https://docs.getdbt.com/reference/global-configs/usage-stats
    DBT_TARGET_PATH: targetPath,
    ...(gitConfigGlobalPath
        ? {
              GIT_CONFIG_GLOBAL: gitConfigGlobalPath,
              GIT_TERMINAL_PROMPT: '0',
          }
        : {}),
});

const MISSING_ENVIRONMENT_VARIABLE_REGEX =
    /Env var required but not provided: '([^']+)'/g;

// dbt raises rather than rendering empty when env_var() names an unset variable,
// so point at the project setting that provides it.
export const getMissingEnvironmentVariableHint = (
    dbtOutput: string,
): string | undefined => {
    const keys = Array.from(
        new Set(
            Array.from(
                dbtOutput.matchAll(MISSING_ENVIRONMENT_VARIABLE_REGEX),
                ([, key]) => key,
            ),
        ),
    );
    if (keys.length === 0) {
        return undefined;
    }

    Logger.warn(
        `dbt requested environment variables that Lightdash does not share with it: ${keys.join(
            ', ',
        )}`,
    );

    return `Your dbt project reads ${keys.join(
        ', ',
    )} from the environment, which is not available during compilation. Set the values in your project's dbt environment variables or ask an administrator to allow the machine environment variables with ALLOW_DBT_COMMANDS_ACCESS_TO_ENV_VARS.`;
};
