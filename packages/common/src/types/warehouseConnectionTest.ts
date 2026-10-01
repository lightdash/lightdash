import assertUnreachable from '../utils/assertUnreachable';
import {
    sensitiveCredentialsFieldNames,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from './projects';
import { WarehouseConnectionFailureCause } from './warehouseConnectionFailure';

export enum WarehouseConnectionTestStage {
    REACH_HOST = 'reach_host',
    TLS = 'tls',
    SIGN_IN = 'sign_in',
    CHECK_ACCESS = 'check_access',
}

export const WAREHOUSE_CONNECTION_TEST_STAGE_ORDER: readonly WarehouseConnectionTestStage[] =
    [
        WarehouseConnectionTestStage.REACH_HOST,
        WarehouseConnectionTestStage.TLS,
        WarehouseConnectionTestStage.SIGN_IN,
        WarehouseConnectionTestStage.CHECK_ACCESS,
    ];

export enum WarehouseConnectionTestStageStatus {
    PASSED = 'passed',
    FAILED = 'failed',
    NOT_CHECKED_SEPARATELY = 'not_checked_separately',
    NOT_RUN = 'not_run',
}

export type WarehouseConnectionTestStageResult = {
    stage: WarehouseConnectionTestStage;
    status: WarehouseConnectionTestStageStatus;
    durationMs: number | null;
};

export enum WarehouseAccessCheckKind {
    HAS_TABLES = 'has_tables',
    EMPTY = 'empty',
    NO_USAGE = 'no_usage',
    DOES_NOT_EXIST = 'does_not_exist',
    EMPTY_OR_NOT_VISIBLE = 'empty_or_not_visible',
}

export type WarehouseAccessCheck = {
    kind: WarehouseAccessCheckKind;
    schema: string;
    tableCount: number | null;
};

export type WarehouseGrantSuggestion = {
    label: 'Likely fix';
    explanation: string;
    statements: string[];
};

export type WarehouseConnectionTestFailure = {
    stage: WarehouseConnectionTestStage;
    cause: WarehouseConnectionFailureCause;
    driverCode: string | null;
    details: string;
};

export type WarehouseConnectionStagedTestResults = {
    ok: boolean;
    host: string | null;
    stages: WarehouseConnectionTestStageResult[];
    failure: WarehouseConnectionTestFailure | null;
    access: WarehouseAccessCheck | null;
    grantSuggestion: WarehouseGrantSuggestion | null;
};

export type ApiWarehouseConnectionStagedTestResponse = {
    status: 'ok';
    results: WarehouseConnectionStagedTestResults;
};

export type WarehouseTestCapability = {
    reachHost: boolean;
    tls: boolean;
};

export const getWarehouseTestCapability = (
    credentials: CreateWarehouseCredentials,
): WarehouseTestCapability => {
    switch (credentials.type) {
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
            return { reachHost: !credentials.useSshTunnel, tls: false };
        case WarehouseTypes.CLICKHOUSE:
            return { reachHost: true, tls: credentials.secure === true };
        case WarehouseTypes.TRINO:
            return {
                reachHost: true,
                tls: credentials.http_scheme === 'https',
            };
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.DATABRICKS:
            return { reachHost: true, tls: true };
        case WarehouseTypes.BIGQUERY:
        case WarehouseTypes.ATHENA:
        case WarehouseTypes.DUCKDB:
            return { reachHost: false, tls: false };
        default:
            return assertUnreachable(credentials, 'Unknown warehouse type');
    }
};

export type WarehouseNetworkEndpoint = {
    host: string;
    port: number;
};

const SNOWFLAKE_HOST_SUFFIX = '.snowflakecomputing.com';

export const getWarehouseNetworkEndpoint = (
    credentials: CreateWarehouseCredentials,
): WarehouseNetworkEndpoint | null => {
    switch (credentials.type) {
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.CLICKHOUSE:
        case WarehouseTypes.TRINO:
            return { host: credentials.host, port: Number(credentials.port) };
        case WarehouseTypes.SNOWFLAKE: {
            if (credentials.accessUrl) {
                try {
                    return {
                        host: new URL(credentials.accessUrl).hostname,
                        port: 443,
                    };
                } catch {
                    return null;
                }
            }
            return {
                host: `${credentials.account}${SNOWFLAKE_HOST_SUFFIX}`,
                port: 443,
            };
        }
        case WarehouseTypes.DATABRICKS:
            return { host: credentials.serverHostName, port: 443 };
        case WarehouseTypes.BIGQUERY:
        case WarehouseTypes.ATHENA:
        case WarehouseTypes.DUCKDB:
            return null;
        default:
            return assertUnreachable(credentials, 'Unknown warehouse type');
    }
};

const quoteDouble = (identifier: string) =>
    `"${identifier.replaceAll('"', '""')}"`;
const quoteBacktick = (identifier: string) =>
    `\`${identifier.replaceAll('`', '``')}\``;

const PLACEHOLDER_PRINCIPAL = '<your user or group>';

export const getWarehouseGrantSuggestion = (
    credentials: CreateWarehouseCredentials,
    schema: string,
): WarehouseGrantSuggestion | null => {
    switch (credentials.type) {
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT: {
            const user = credentials.user
                ? quoteDouble(credentials.user)
                : PLACEHOLDER_PRINCIPAL;
            return {
                label: 'Likely fix',
                explanation: `Ask a database admin to let ${credentials.user || 'this user'} read the ${schema} schema.`,
                statements: [
                    `GRANT USAGE ON SCHEMA ${quoteDouble(schema)} TO ${user};`,
                    `GRANT SELECT ON ALL TABLES IN SCHEMA ${quoteDouble(schema)} TO ${user};`,
                ],
            };
        }
        case WarehouseTypes.SNOWFLAKE: {
            const role = credentials.role
                ? quoteDouble(credentials.role)
                : '<your role>';
            const database = quoteDouble(credentials.database);
            const qualifiedSchema = `${database}.${quoteDouble(schema)}`;
            return {
                label: 'Likely fix',
                explanation: `Ask a Snowflake admin to grant ${credentials.role || 'your role'} read access to ${credentials.database}.${schema}.`,
                statements: [
                    `GRANT USAGE ON WAREHOUSE ${quoteDouble(credentials.warehouse)} TO ROLE ${role};`,
                    `GRANT USAGE ON DATABASE ${database} TO ROLE ${role};`,
                    `GRANT USAGE ON SCHEMA ${qualifiedSchema} TO ROLE ${role};`,
                    `GRANT SELECT ON ALL TABLES IN SCHEMA ${qualifiedSchema} TO ROLE ${role};`,
                    `GRANT SELECT ON ALL VIEWS IN SCHEMA ${qualifiedSchema} TO ROLE ${role};`,
                ],
            };
        }
        case WarehouseTypes.DATABRICKS: {
            const catalog = credentials.catalog
                ? quoteBacktick(credentials.catalog)
                : null;
            const qualifiedSchema = catalog
                ? `${catalog}.${quoteBacktick(schema)}`
                : quoteBacktick(schema);
            return {
                label: 'Likely fix',
                explanation: `Ask a workspace admin to give your user or service principal read access to ${schema}.`,
                statements: [
                    ...(catalog
                        ? [
                              `GRANT USE CATALOG ON CATALOG ${catalog} TO \`${PLACEHOLDER_PRINCIPAL}\`;`,
                          ]
                        : []),
                    `GRANT USE SCHEMA ON SCHEMA ${qualifiedSchema} TO \`${PLACEHOLDER_PRINCIPAL}\`;`,
                    `GRANT SELECT ON SCHEMA ${qualifiedSchema} TO \`${PLACEHOLDER_PRINCIPAL}\`;`,
                ],
            };
        }
        case WarehouseTypes.CLICKHOUSE:
            return {
                label: 'Likely fix',
                explanation: `Ask a ClickHouse admin to let ${credentials.user} read the ${schema} database.`,
                statements: [
                    `GRANT SELECT ON ${quoteBacktick(schema)}.* TO ${quoteBacktick(credentials.user)};`,
                ],
            };
        case WarehouseTypes.TRINO:
            return {
                label: 'Likely fix',
                explanation: `Access in Trino depends on how your cluster controls access. If it uses SQL grants, ask an admin to run:`,
                statements: [
                    `GRANT SELECT ON SCHEMA ${quoteDouble(credentials.dbname)}.${quoteDouble(schema)} TO USER ${quoteDouble(credentials.user)};`,
                ],
            };
        case WarehouseTypes.BIGQUERY:
            return {
                label: 'Likely fix',
                explanation: `BigQuery access is set with IAM roles. Give the account you connect with the BigQuery Data Viewer role on the ${schema} dataset, and the BigQuery Job User role on the ${credentials.project} project.`,
                statements: [
                    `GRANT \`roles/bigquery.dataViewer\` ON SCHEMA ${quoteBacktick(`${credentials.project}.${schema}`)} TO "${PLACEHOLDER_PRINCIPAL}";`,
                ],
            };
        case WarehouseTypes.ATHENA:
            return {
                label: 'Likely fix',
                explanation: `Athena access is set with IAM policies. Allow the role you connect with to run Athena queries, read the ${schema} database in the Glue Data Catalog, read its data in S3, and write to the query results location.`,
                statements: [],
            };
        case WarehouseTypes.DUCKDB:
            return null;
        default:
            return assertUnreachable(credentials, 'Unknown warehouse type');
    }
};

export const getWarehouseTestSchema = (
    credentials: CreateWarehouseCredentials,
): string | null => {
    switch (credentials.type) {
        case WarehouseTypes.BIGQUERY:
            return credentials.dataset || null;
        case WarehouseTypes.DATABRICKS:
            return credentials.database || null;
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
        case WarehouseTypes.SNOWFLAKE:
        case WarehouseTypes.CLICKHOUSE:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.ATHENA:
        case WarehouseTypes.DUCKDB:
            return credentials.schema || null;
        default:
            return assertUnreachable(credentials, 'Unknown warehouse type');
    }
};

export const getWarehouseCredentialSecrets = (
    credentials: CreateWarehouseCredentials,
): string[] =>
    sensitiveCredentialsFieldNames
        .filter((field) => field !== 'user')
        .flatMap((field) => {
            const value: unknown = (credentials as Record<string, unknown>)[
                field
            ];
            return typeof value === 'string' && value.length > 0 ? [value] : [];
        });

export const WAREHOUSE_EGRESS_IP_CONTROL: Record<
    WarehouseTypes,
    string | null
> = {
    [WarehouseTypes.SNOWFLAKE]:
        'Add them to the allowed IP list of your Snowflake network policy.',
    [WarehouseTypes.POSTGRES]:
        'Allow them in your security group, firewall rule or pg_hba.conf.',
    [WarehouseTypes.REDSHIFT]:
        'Add them as inbound rules on your cluster’s VPC security group.',
    [WarehouseTypes.DATABRICKS]: 'Add them to your workspace IP access list.',
    [WarehouseTypes.CLICKHOUSE]:
        'Add them to your ClickHouse Cloud IP access list or firewall.',
    [WarehouseTypes.TRINO]:
        'Allow them in the firewall or load balancer in front of your cluster.',
    [WarehouseTypes.BIGQUERY]: null,
    [WarehouseTypes.ATHENA]: null,
    [WarehouseTypes.DUCKDB]: null,
};

export const parseEgressIps = (staticIp: string | undefined): string[] =>
    (staticIp ?? '')
        .split(/[\s,]+/)
        .map((ip) => ip.trim())
        .filter((ip) => ip.length > 0);

const CONNECT_PROJECT_DOCS =
    'https://docs.lightdash.com/integrations/connect-project';

const WAREHOUSE_DOCS_ANCHORS: Record<WarehouseTypes, string> = {
    [WarehouseTypes.BIGQUERY]: 'bigquery',
    [WarehouseTypes.POSTGRES]: 'postgres',
    [WarehouseTypes.REDSHIFT]: 'redshift',
    [WarehouseTypes.SNOWFLAKE]: 'snowflake',
    [WarehouseTypes.DATABRICKS]: 'databricks',
    [WarehouseTypes.TRINO]: 'trino',
    [WarehouseTypes.CLICKHOUSE]: 'clickhouse',
    [WarehouseTypes.ATHENA]: 'athena',
    [WarehouseTypes.DUCKDB]: 'duckdb',
};

export const getWarehouseConnectionDocsUrl = (
    warehouseType: WarehouseTypes,
    cause: WarehouseConnectionFailureCause,
): string =>
    cause === WarehouseConnectionFailureCause.NETWORK ||
    cause === WarehouseConnectionFailureCause.TIMEOUT
        ? `${CONNECT_PROJECT_DOCS}#adding-lightdashs-static-ip-addresses-to-your-allow-list`
        : `${CONNECT_PROJECT_DOCS}#${WAREHOUSE_DOCS_ANCHORS[warehouseType]}`;
