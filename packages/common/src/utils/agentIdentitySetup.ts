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

export interface AthenaAiServiceAccountCommands {
    roleTrustPolicy: string;
    permissionPolicy: string;
    lakeFormationGrants: string;
    filteredTableGrant: string;
}

export const buildAthenaAiServiceAccountCommands = ({
    region,
    catalog,
    database,
}: {
    region: string | null;
    catalog: string | null;
    database: string | null;
}): AthenaAiServiceAccountCommands => {
    const awsRegion = region || '<region>';
    const glueDatabase = database || '<glue-database>';
    const athenaArn = `arn:<partition>:athena:${awsRegion}:<account-id>`;
    const glueArn = `arn:<partition>:glue:${awsRegion}:<account-id>`;
    const roleTrustPolicy = {
        Version: '2012-10-17',
        Statement: [
            {
                Effect: 'Allow',
                Principal: { AWS: '<trusted-caller-iam-arn>' },
                Action: 'sts:AssumeRole',
            },
        ],
    };
    const permissionPolicy = {
        Version: '2012-10-17',
        Statement: [
            {
                Effect: 'Allow',
                Action: [
                    'athena:StartQueryExecution',
                    'athena:GetQueryExecution',
                    'athena:GetQueryResults',
                    'athena:GetWorkGroup',
                ],
                Resource: `${athenaArn}:workgroup/<agent-workgroup>`,
            },
            {
                Effect: 'Allow',
                Action: [
                    'athena:GetDataCatalog',
                    'athena:GetDatabase',
                    'athena:GetTableMetadata',
                    'athena:ListDatabases',
                    'athena:ListTableMetadata',
                ],
                Resource: `${athenaArn}:datacatalog/${catalog || '<catalog>'}`,
            },
            {
                Effect: 'Allow',
                Action: [
                    's3:GetBucketLocation',
                    's3:ListBucket',
                    's3:ListBucketMultipartUploads',
                ],
                Resource: 'arn:<partition>:s3:::<agent-results-bucket>',
            },
            {
                Effect: 'Allow',
                Action: [
                    's3:GetObject',
                    's3:PutObject',
                    's3:AbortMultipartUpload',
                    's3:ListMultipartUploadParts',
                ],
                Resource:
                    'arn:<partition>:s3:::<agent-results-bucket>/<agent-results-prefix>/*',
            },
            {
                Effect: 'Allow',
                Action: [
                    'glue:GetDatabase',
                    'glue:GetDatabases',
                    'glue:GetTable',
                    'glue:GetTables',
                    'glue:GetPartition',
                    'glue:GetPartitions',
                    'glue:BatchGetPartition',
                ],
                Resource: [
                    `${glueArn}:catalog`,
                    `${glueArn}:database/${glueDatabase}`,
                    `${glueArn}:table/${glueDatabase}/*`,
                ],
            },
            {
                Effect: 'Allow',
                Action: 'lakeformation:GetDataAccess',
                Resource: '*',
            },
        ],
    };
    const principal = JSON.stringify({
        DataLakePrincipalIdentifier: '<agent-iam-principal-arn>',
    });
    const grant = (resource: object, permission: 'DESCRIBE' | 'SELECT') =>
        `aws lakeformation grant-permissions --region ${shellWord(awsRegion)} \\
  --principal ${singleQuote(principal)} \\
  --resource ${singleQuote(JSON.stringify(resource))} \\
  --permissions ${permission}`;
    return {
        roleTrustPolicy: JSON.stringify(roleTrustPolicy, null, 2),
        permissionPolicy: JSON.stringify(permissionPolicy, null, 2),
        lakeFormationGrants: [
            grant(
                { Database: { CatalogId: '<account-id>', Name: glueDatabase } },
                'DESCRIBE',
            ),
            grant(
                {
                    Table: {
                        CatalogId: '<account-id>',
                        DatabaseName: glueDatabase,
                        Name: '<table>',
                    },
                },
                'SELECT',
            ),
        ].join('\n'),
        filteredTableGrant: grant(
            {
                DataCellsFilter: {
                    TableCatalogId: '<account-id>',
                    DatabaseName: glueDatabase,
                    TableName: '<table>',
                    Name: '<data-filter>',
                },
            },
            'SELECT',
        ),
    };
};

export interface PostgresAiServiceAccountCommands {
    createRole: string;
    grantReadAccess: string;
    rowLevelSecurity: string;
}

export const buildPostgresAiServiceAccountCommands = ({
    dbname,
    schema,
}: {
    dbname: string | null;
    schema: string | null;
}): PostgresAiServiceAccountCommands => {
    const quoteIdentifier = (value: string): string =>
        `"${value.replaceAll('"', '""')}"`;
    const databaseIdentifier = quoteIdentifier(dbname || '<database>');
    const schemaIdentifier = quoteIdentifier(schema || '<schema>');
    const role = quoteIdentifier('ai_agents');
    const table = `${schemaIdentifier}.${quoteIdentifier('<table>')}`;
    return {
        createRole: `CREATE ROLE ${role} LOGIN PASSWORD '<choose-a-strong-password>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE ${role} SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE ${databaseIdentifier} TO ${role};`,
        grantReadAccess: `GRANT USAGE ON SCHEMA ${schemaIdentifier} TO ${role};
GRANT SELECT ON ALL TABLES IN SCHEMA ${schemaIdentifier} TO ${role};
ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaIdentifier} GRANT SELECT ON TABLES TO ${role};`,
        rowLevelSecurity: `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_agents_rows" ON ${table} FOR SELECT TO ${role} USING (<condition>);`,
    };
};
