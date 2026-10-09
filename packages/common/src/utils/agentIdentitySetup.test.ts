import { describe, expect, it } from 'vitest';
import { ParameterError } from '../types/errors';
import {
    buildBigQueryAiServiceAccountCommands,
    buildDatabricksAiServiceAccountCommands,
    buildSnowflakeAgentIntegrationSql,
    getSnowflakeAgentRedirectUri,
    parseSnowflakeAccountUrl,
    SNOWFLAKE_AGENT_OAUTH_SETTINGS,
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
    it('lists the four required settings in order', () => {
        expect(
            SNOWFLAKE_AGENT_OAUTH_SETTINGS.map(({ envVar }) => envVar),
        ).toEqual([
            'SNOWFLAKE_AI_OAUTH_CLIENT_ID',
            'SNOWFLAKE_AI_OAUTH_CLIENT_SECRET',
            'SNOWFLAKE_AI_OAUTH_AUTHORIZATION_ENDPOINT',
            'SNOWFLAKE_AI_OAUTH_TOKEN_ENDPOINT',
        ]);
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
