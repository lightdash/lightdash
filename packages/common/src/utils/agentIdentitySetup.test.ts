import { describe, expect, it } from 'vitest';
import {
    buildBigQueryAiServiceAccountCommands,
    buildSnowflakeAgentIntegrationSql,
    getSnowflakeAgentRedirectUri,
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
                    'gcloud iam service-accounts create lightdash-agents --project=data-project --display-name="AI agents"',
            },
            {
                step: 'job_user',
                title: 'Allow the service account to run jobs',
                command:
                    'gcloud projects add-iam-policy-binding job-project --member="serviceAccount:lightdash-agents@data-project.iam.gserviceaccount.com" --role="roles/bigquery.jobUser"',
            },
            {
                step: 'data_viewer',
                title: 'Allow the service account to read the dataset',
                command:
                    'bq query --project_id=job-project --nouse_legacy_sql \'GRANT `roles/bigquery.dataViewer` ON SCHEMA `data-project`.analytics TO "serviceAccount:lightdash-agents@data-project.iam.gserviceaccount.com"\'',
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
                'gcloud iam service-accounts create custom-agent --project=data-project --display-name="AI agents"',
                'gcloud projects add-iam-policy-binding data-project --member="serviceAccount:custom-agent@data-project.iam.gserviceaccount.com" --role="roles/bigquery.jobUser"',
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
            "gcloud iam service-accounts create 'agent`id`' --project='project'\"'\"'$(whoami)' --display-name=\"AI agents\"",
            'gcloud projects add-iam-policy-binding \'jobs; echo bad\' --member="serviceAccount:agent\\`id\\`@project\'\\$(whoami).iam.gserviceaccount.com" --role="roles/bigquery.jobUser"',
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
            "bq query --project_id=data --nouse_legacy_sql 'GRANT `roles/bigquery.dataViewer` ON SCHEMA `data`.`odd\\`'\"'\"'$(id)` TO \"serviceAccount:lightdash-agents@data.iam.gserviceaccount.com\"'",
        );
    });
});
