import { ParameterError } from '../types/errors';

export const SNOWFLAKE_AI_CALLBACK_PATH = '/oauth/redirect/snowflake-ai';

export const getSnowflakeAgentRedirectUri = (siteUrl: string): string =>
    new URL(`/api/v1${SNOWFLAKE_AI_CALLBACK_PATH}`, siteUrl).href;

export const SNOWFLAKE_AGENT_INTEGRATION_NAME = 'LIGHTDASH_AGENT';

export const buildSnowflakeAgentIntegrationSql = ({
    redirectUri,
}: {
    redirectUri: string;
}): string => `CREATE SECURITY INTEGRATION ${SNOWFLAKE_AGENT_INTEGRATION_NAME}
  TYPE = OAUTH
  OAUTH_CLIENT = CUSTOM
  OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
  OAUTH_REDIRECT_URI = '${redirectUri.replaceAll("'", "''")}'
  ENABLED = TRUE
  IS_AGENTIC = TRUE
  OAUTH_ISSUE_REFRESH_TOKENS = TRUE
  OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;
SELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('${SNOWFLAKE_AGENT_INTEGRATION_NAME}');`;

const singleQuote = (value: string): string =>
    `'${value.replaceAll("'", "'\"'\"'")}'`;
const shellWord = (value: string): string =>
    /^[a-zA-Z0-9_./:@-]+$/.test(value) ? value : singleQuote(value);
const doubleQuote = (value: string): string =>
    `"${value.replace(/[\\"$`]/g, '\\$&')}"`;
const bigQueryIdentifier = (value: string): string =>
    `\`${value.replaceAll('\\', '\\\\').replaceAll('`', '\\`')}\``;

export type BigQueryAiServiceAccountCommand = {
    step: 'create' | 'job_user' | 'data_viewer';
    title: string;
    command: string;
};

export const buildBigQueryAiServiceAccountCommands = ({
    project,
    executionProject,
    dataset,
    serviceAccountName = 'lightdash-agents',
}: {
    project: string;
    executionProject: string | null;
    dataset: string | null;
    serviceAccountName?: string;
}): BigQueryAiServiceAccountCommand[] => {
    const jobProject = executionProject ?? project;
    const member = `serviceAccount:${serviceAccountName}@${project}.iam.gserviceaccount.com`;
    const commands: BigQueryAiServiceAccountCommand[] = [
        {
            step: 'create',
            title: 'Create the service account',
            command: `gcloud iam service-accounts create ${shellWord(serviceAccountName)} \\
  --project=${shellWord(project)} \\
  --display-name="AI agents"`,
        },
        {
            step: 'job_user',
            title: 'Allow the service account to run jobs',
            command: `gcloud projects add-iam-policy-binding ${shellWord(jobProject)} \\
  --member=${doubleQuote(member)} \\
  --role="roles/bigquery.jobUser"`,
        },
    ];
    if (dataset) {
        const schema = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dataset)
            ? dataset
            : bigQueryIdentifier(dataset);
        const sqlMember = member
            .replaceAll('\\', '\\\\')
            .replaceAll('"', '\\"');
        const grant = `GRANT \`roles/bigquery.dataViewer\` ON SCHEMA ${bigQueryIdentifier(project)}.${schema} TO "${sqlMember}"`;
        commands.push({
            step: 'data_viewer',
            title: 'Allow the service account to read the dataset',
            command: `bq query \\
  --project_id=${shellWord(jobProject)} \\
  --nouse_legacy_sql \\
  ${singleQuote(grant)}`,
        });
    }
    return commands;
};

export const parseSnowflakeAccountUrl = (
    input: string,
): {
    accountUrl: string;
    accountIdentifier: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
} => {
    const value = input.trim();
    const invalid = () =>
        new ParameterError(
            'Provide an HTTPS Snowflake account URL with no path, credentials, query or fragment.',
        );
    if (!value || /[\\\s?#@]/.test(value)) throw invalid();
    const candidate = value.includes('://') ? value : `https://${value}`;
    if (!/^https:\/\/[^/]+\/?$/i.test(candidate)) throw invalid();
    let url: URL;
    try {
        url = new URL(candidate);
    } catch {
        throw invalid();
    }
    const suffix = '.snowflakecomputing.com';
    if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== '/' ||
        !url.hostname.endsWith(suffix)
    )
        throw invalid();
    const accountHost = url.hostname.slice(0, -suffix.length);
    if (
        !accountHost ||
        !accountHost
            .split('.')
            .every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
    )
        throw invalid();
    const accountIdentifier = accountHost
        .split('.')
        .filter((label) => label !== 'privatelink')
        .join('.');
    if (!accountIdentifier) throw invalid();
    return {
        accountUrl: url.origin,
        accountIdentifier,
        authorizationEndpoint: `${url.origin}/oauth/authorize`,
        tokenEndpoint: `${url.origin}/oauth/token-request`,
    };
};

export const buildDatabricksAiServiceAccountCommands = ({
    catalog,
    schema,
}: {
    catalog: string | null;
    schema: string | null;
}): string => {
    const quote = (value: string): string =>
        `\`${value.replaceAll('`', '``')}\``;
    const catalogIdentifier = quote(catalog || '<catalog>');
    const schemaIdentifier = `${catalogIdentifier}.${quote(schema || '<schema>')}`;
    const principal = quote('<service-principal-application-id>');
    return `GRANT USE CATALOG ON CATALOG ${catalogIdentifier} TO ${principal};
GRANT USE SCHEMA ON SCHEMA ${schemaIdentifier} TO ${principal};
GRANT SELECT ON TABLE ${schemaIdentifier}.${quote('<table>')} TO ${principal};`;
};
