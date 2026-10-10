import { describe, expect, it } from 'vitest';
import { ParameterError } from '../types/errors';
import {
    buildAthenaAiServiceAccountCommands,
    buildBigQueryAiServiceAccountCommands,
    buildDatabricksAiServiceAccountCommands,
    buildPostgresAiServiceAccountCommands,
    buildSnowflakeAgentIntegrationSql,
    getSnowflakeAgentRedirectUri,
    parseSnowflakeAccountUrl,
} from './agentIdentitySetup';

describe('Snowflake agent setup', () => {
    it.each([
        'https://instance.example',
        'https://instance.example/',
        'https://instance.example/nested/path',
    ])('uses the root callback for %s', (siteUrl) => {
        expect(getSnowflakeAgentRedirectUri(siteUrl)).toBe(
            'https://instance.example/api/v1/oauth/redirect/snowflake-ai',
        );
    });
    it('preserves the documented integration SQL and escapes quotes', () => {
        expect(
            buildSnowflakeAgentIntegrationSql({
                redirectUri: "https://instance.example/it's",
            }),
        ).toBe(`CREATE SECURITY INTEGRATION LIGHTDASH_AGENT
  TYPE = OAUTH
  OAUTH_CLIENT = CUSTOM
  OAUTH_CLIENT_TYPE = 'CONFIDENTIAL'
  OAUTH_REDIRECT_URI = 'https://instance.example/it''s'
  ENABLED = TRUE
  IS_AGENTIC = TRUE
  OAUTH_ISSUE_REFRESH_TOKENS = TRUE
  OAUTH_REFRESH_TOKEN_VALIDITY = 7776000;
SELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('LIGHTDASH_AGENT');`);
    });
});

describe('BigQuery AI service account commands', () => {
    it('uses the connection project for the identity and the execution project for jobs', () => {
        expect(
            buildBigQueryAiServiceAccountCommands({
                project: 'data-project',
                executionProject: 'job-project',
                dataset: 'analytics',
            }),
        ).toEqual([
            {
                step: 'create',
                title: 'Create the service account',
                command:
                    'gcloud iam service-accounts create lightdash-agents \\\n  --project=data-project \\\n  --display-name="AI agents"',
            },
            {
                step: 'job_user',
                title: 'Allow the service account to run jobs',
                command:
                    'gcloud projects add-iam-policy-binding job-project \\\n  --member="serviceAccount:lightdash-agents@data-project.iam.gserviceaccount.com" \\\n  --role="roles/bigquery.jobUser"',
            },
            {
                step: 'data_viewer',
                title: 'Allow the service account to read the dataset',
                command:
                    'bq query \\\n  --project_id=job-project \\\n  --nouse_legacy_sql \\\n  \'GRANT `roles/bigquery.dataViewer` ON SCHEMA `data-project`.analytics TO "serviceAccount:lightdash-agents@data-project.iam.gserviceaccount.com"\'',
            },
        ]);
    });
    it.each([null, ''])(
        'omits an absent dataset (%s) and defaults the execution project',
        (dataset) => {
            const commands = buildBigQueryAiServiceAccountCommands({
                project: 'data-project',
                executionProject: null,
                dataset,
                serviceAccountName: 'custom-agent',
            });
            expect(commands.map(({ command }) => command)).toEqual([
                'gcloud iam service-accounts create custom-agent \\\n  --project=data-project \\\n  --display-name="AI agents"',
                'gcloud projects add-iam-policy-binding data-project \\\n  --member="serviceAccount:custom-agent@data-project.iam.gserviceaccount.com" \\\n  --role="roles/bigquery.jobUser"',
            ]);
        },
    );
    it('quotes shell metacharacters without expanding them', () => {
        const commands = buildBigQueryAiServiceAccountCommands({
            project: "project'$(whoami)",
            executionProject: 'jobs; echo bad',
            dataset: null,
            serviceAccountName: 'agent`id`',
        });
        expect(commands.map(({ command }) => command)).toEqual([
            "gcloud iam service-accounts create 'agent`id`' \\\n  --project='project'\"'\"'$(whoami)' \\\n  --display-name=\"AI agents\"",
            'gcloud projects add-iam-policy-binding \'jobs; echo bad\' \\\n  --member="serviceAccount:agent\\`id\\`@project\'\\$(whoami).iam.gserviceaccount.com" \\\n  --role="roles/bigquery.jobUser"',
        ]);
    });
    it('quotes the complete grant and escapes dataset identifiers', () => {
        expect(
            buildBigQueryAiServiceAccountCommands({
                project: 'data',
                executionProject: null,
                dataset: "odd`'$(id)",
            })[2].command,
        ).toBe(
            "bq query \\\n  --project_id=data \\\n  --nouse_legacy_sql \\\n  'GRANT `roles/bigquery.dataViewer` ON SCHEMA `data`.`odd\\`'\"'\"'$(id)` TO \"serviceAccount:lightdash-agents@data.iam.gserviceaccount.com\"'",
        );
    });
});

describe('parseSnowflakeAccountUrl', () => {
    it.each([
        ['abc-xy12345.snowflakecomputing.com', 'abc-xy12345'],
        ['https://ABC-XY12345.snowflakecomputing.com/', 'abc-xy12345'],
        [
            'https://abc.eu-west-1.aws.snowflakecomputing.com:443',
            'abc.eu-west-1.aws',
        ],
        [
            'https://abc.eu-west-1.privatelink.snowflakecomputing.com',
            'abc.eu-west-1',
        ],
        ['  https://org-account.snowflakecomputing.com  ', 'org-account'],
    ])('normalizes %s', (input, accountIdentifier) => {
        const result = parseSnowflakeAccountUrl(input);
        expect(result.accountIdentifier).toBe(accountIdentifier);
        expect(result.accountUrl).toBe(
            `https://${input
                .trim()
                .replace(/^https:\/\//i, '')
                .replace(/\/$/, '')
                .replace(/:443$/, '')
                .toLowerCase()}`,
        );
        expect(result.authorizationEndpoint).toBe(
            `${result.accountUrl}/oauth/authorize`,
        );
        expect(result.tokenEndpoint).toBe(
            `${result.accountUrl}/oauth/token-request`,
        );
    });
    it.each([
        '',
        'http://abc.snowflakecomputing.com',
        'ftp://abc.snowflakecomputing.com',
        'https://snowflakecomputing.com',
        'https://notsnowflakecomputing.com',
        'https://abc.snowflakecomputing.com.evil.test',
        'https://.snowflakecomputing.com',
        'https://abc.snowflakecomputing.com:444',
        'https://user@abc.snowflakecomputing.com',
        'https://user:secret@abc.snowflakecomputing.com',
        'https://abc.snowflakecomputing.com/path',
        'https://abc.snowflakecomputing.com/path/..',
        'https://abc.snowflakecomputing.com/%2e',
        'https://abc.snowflakecomputing.com?',
        'https://abc.snowflakecomputing.com#',
        'https://abc.snowflakecomputing.com?x=1',
        'https://abc.snowflakecomputing.com#fragment',
        'https://abc.snowflakecomputing.com\\evil',
        'https://a b.snowflakecomputing.com',
        'https://-abc.snowflakecomputing.com',
        'https://abc..snowflakecomputing.com',
    ])('rejects %s', (input) => {
        expect(() => parseSnowflakeAccountUrl(input)).toThrow(ParameterError);
    });
});

describe('Databricks service account grants', () => {
    it('grants catalog/schema use and per-table reads with an explicit principal placeholder', () => {
        expect(
            buildDatabricksAiServiceAccountCommands({
                catalog: 'analytics',
                schema: 'public',
            }),
        ).toBe(
            'GRANT USE CATALOG ON CATALOG `analytics` TO `<service-principal-application-id>`;\nGRANT USE SCHEMA ON SCHEMA `analytics`.`public` TO `<service-principal-application-id>`;\nGRANT SELECT ON TABLE `analytics`.`public`.`<table>` TO `<service-principal-application-id>`;',
        );
    });
    it('uses placeholders for missing identifiers', () => {
        expect(
            buildDatabricksAiServiceAccountCommands({
                catalog: null,
                schema: null,
            }),
        ).toContain('`<catalog>`.`<schema>`.`<table>`');
    });
    it('escapes identifier delimiters without creating broad grants', () => {
        const sql = buildDatabricksAiServiceAccountCommands({
            catalog: 'a`b',
            schema: 'c`d',
        });
        expect(sql).toContain('`a``b`.`c``d`.`<table>`');
        expect(sql).not.toMatch(
            /ALL PRIVILEGES|ALL TABLES|CREATE SERVICE|SECRET/,
        );
    });
});

describe('Athena setup', () => {
    it('substitutes only routing values and keeps identity and location placeholders', () => {
        const result = buildAthenaAiServiceAccountCommands({
            region: 'eu-west-1',
            catalog: 'AwsDataCatalog',
            database: 'analytics',
        });
        expect(JSON.parse(result.roleTrustPolicy)).toEqual({
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: { AWS: '<trusted-caller-iam-arn>' },
                    Action: 'sts:AssumeRole',
                },
            ],
        });
        const policy = JSON.parse(result.permissionPolicy);
        expect(policy.Statement[0].Resource).toBe(
            'arn:<partition>:athena:eu-west-1:<account-id>:workgroup/<agent-workgroup>',
        );
        expect(policy.Statement[1].Resource).toBe(
            'arn:<partition>:athena:eu-west-1:<account-id>:datacatalog/AwsDataCatalog',
        );
        expect(policy.Statement[3].Resource).toBe(
            'arn:<partition>:s3:::<agent-results-bucket>/<agent-results-prefix>/*',
        );
        expect(policy.Statement[4].Resource).toEqual([
            'arn:<partition>:glue:eu-west-1:<account-id>:catalog',
            'arn:<partition>:glue:eu-west-1:<account-id>:database/analytics',
            'arn:<partition>:glue:eu-west-1:<account-id>:table/analytics/*',
        ]);
        expect(result.lakeFormationGrants).toContain('--permissions DESCRIBE');
        expect(result.lakeFormationGrants).toContain('--permissions SELECT');
        expect(result.lakeFormationGrants).not.toMatch(
            /TableWildcard|permissions-with-grant-option/,
        );
        expect(result.filteredTableGrant).toContain('"DataCellsFilter"');
        expect(result.filteredTableGrant).toContain('"TableName":"<table>"');
        expect(result.filteredTableGrant).toContain('"Name":"<data-filter>"');
        expect(result.filteredTableGrant).toContain(
            '<agent-iam-principal-arn>',
        );
    });
    it('uses placeholders when routing is unknown', () => {
        const result = buildAthenaAiServiceAccountCommands({
            region: null,
            catalog: null,
            database: null,
        });
        expect(result.permissionPolicy).toContain('<region>');
        expect(result.permissionPolicy).toContain('<catalog>');
        expect(result.permissionPolicy).toContain('<glue-database>');
    });
    it('preserves quotes and shell metacharacters inside JSON and shell arguments', () => {
        const value = 'a\'"\\$HOME`command`\n; $(command)';
        const result = buildAthenaAiServiceAccountCommands({
            region: value,
            catalog: value,
            database: value,
        });
        expect(JSON.parse(result.permissionPolicy).Statement[1].Resource).toBe(
            `arn:<partition>:athena:${value}:<account-id>:datacatalog/${value}`,
        );
        expect(result.filteredTableGrant).toContain(
            `--region '${value.replaceAll("'", "'\"'\"'")}'`,
        );
        const resource = JSON.stringify({
            DataCellsFilter: {
                TableCatalogId: '<account-id>',
                DatabaseName: value,
                TableName: '<table>',
                Name: '<data-filter>',
            },
        });
        expect(result.filteredTableGrant).toContain(
            `--resource '${resource.replaceAll("'", "'\"'\"'")}'`,
        );
    });
});

describe('Postgres AI service account setup commands', () => {
    it('creates a restricted login and separate grants and row policy', () => {
        const commands = buildPostgresAiServiceAccountCommands({
            dbname: 'analytics',
            schema: 'reporting',
        });
        expect(commands.createRole).toBe(
            `CREATE ROLE "ai_agents" LOGIN PASSWORD '<choose-a-strong-password>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE "ai_agents" SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE "analytics" TO "ai_agents";`,
        );
        expect(commands.grantReadAccess).toBe(
            `GRANT USAGE ON SCHEMA "reporting" TO "ai_agents";
GRANT SELECT ON ALL TABLES IN SCHEMA "reporting" TO "ai_agents";
ALTER DEFAULT PRIVILEGES IN SCHEMA "reporting" GRANT SELECT ON TABLES TO "ai_agents";`,
        );
        expect(commands.rowLevelSecurity).toBe(
            `ALTER TABLE "reporting"."<table>" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_agents_rows" ON "reporting"."<table>" FOR SELECT TO "ai_agents" USING (<condition>);`,
        );
    });
    it('escapes quotes in identifiers without treating apostrophes as literals', () => {
        const commands = buildPostgresAiServiceAccountCommands({
            dbname: `data"base's`,
            schema: `read"; DROP ROLE "someone`,
        });
        expect(commands.createRole).toContain(
            `ON DATABASE "data""base's" TO "ai_agents"`,
        );
        expect(commands.grantReadAccess).toContain(
            `ON SCHEMA "read""; DROP ROLE ""someone" TO "ai_agents"`,
        );
        expect(commands.rowLevelSecurity).toContain(
            `"read""; DROP ROLE ""someone"."<table>"`,
        );
    });
    it.each([null, ''])(
        'uses placeholders for %s connection settings',
        (value) => {
            const commands = buildPostgresAiServiceAccountCommands({
                dbname: value,
                schema: value,
            });
            expect(commands.createRole).toContain('ON DATABASE "<database>"');
            expect(commands.grantReadAccess).toContain('ON SCHEMA "<schema>"');
            expect(commands.rowLevelSecurity).toContain('"<schema>"."<table>"');
        },
    );
});
