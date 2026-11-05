import {
    applyWarehouseLocation,
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
    type WarehouseLocation,
} from '@lightdash/common';
import * as yaml from 'js-yaml';
import {
    LIGHTDASH_PROFILE_NAME,
    LIGHTDASH_TARGET_NAME,
    profileFromCredentials,
    profileFromTarget,
} from './profiles';
import { toDbtTarget } from './targets';
import {
    bigqueryOauthTarget,
    bigqueryWif,
    bigqueryWifFile,
} from './targets/targets.mock';

const sourceLocation: WarehouseLocation = {
    database: 'source-database',
    schema: 'source_schema',
};

describe('BigQuery workload identity profile', () => {
    it.each([
        {
            name: 'default audience',
            workloadIdentityAudience: undefined,
            encodedAudience:
                'https%3A%2F%2Fiam.googleapis.com%2Fprojects%2F123456%2Flocations%2Fglobal%2FworkloadIdentityPools%2Fpool-id%2Fproviders%2Fprovider-id',
        },
        {
            name: 'custom audience with URL syntax',
            workloadIdentityAudience:
                'https://identity.example/a?x=1&format=json#token',
            encodedAudience:
                'https%3A%2F%2Fidentity.example%2Fa%3Fx%3D1%26format%3Djson%23token',
        },
    ])(
        'builds a fixed external-account config with $name',
        ({ workloadIdentityAudience, encodedAudience }) => {
            const submittedCredentials = {
                ...bigqueryWif,
                workloadIdentityAudience,
                token_url: 'https://untrusted.example/token',
                credential_source: {
                    url: 'https://untrusted.example/identity',
                    file: '/untrusted/token',
                    headers: { 'Metadata-Flavor': 'Untrusted' },
                },
                service_account_impersonation_url:
                    'https://untrusted.example/impersonate',
            };
            const { profile, environment, files } = profileFromCredentials(
                submittedCredentials,
                '/tmp/profiles',
            );
            expect(yaml.load(profile)).toEqual({
                lightdash_profile: {
                    target: 'prod',
                    outputs: { prod: bigqueryOauthTarget },
                },
            });
            expect(environment).toEqual({
                GOOGLE_APPLICATION_CREDENTIALS:
                    '/tmp/profiles/bigquery-workload-identity.json',
            });
            expect(files).toEqual([
                {
                    path: '/tmp/profiles/bigquery-workload-identity.json',
                    content: bigqueryWifFile(encodedAudience).content,
                },
            ]);
        },
    );

    it('keeps credential paths local to each profile without mutating the target', () => {
        const target = toDbtTarget(bigqueryWif, { explicitCredentials: true });
        const first = profileFromTarget(target, '/tmp/first');
        const second = profileFromTarget(target, '/tmp/second');
        expect(first.environment.GOOGLE_APPLICATION_CREDENTIALS).toBe(
            '/tmp/first/bigquery-workload-identity.json',
        );
        expect(second.environment.GOOGLE_APPLICATION_CREDENTIALS).toBe(
            '/tmp/second/bigquery-workload-identity.json',
        );
        expect(target).toEqual(
            toDbtTarget(bigqueryWif, { explicitCredentials: true }),
        );
    });
});

const targetFor = (credentials: CreateWarehouseCredentials) => {
    const { profile } = profileFromCredentials(
        applyWarehouseLocation(credentials, sourceLocation),
        '/tmp/profiles',
    );
    const parsed = yaml.load(profile) as Record<
        string,
        { outputs: Record<string, Record<string, unknown>> }
    >;
    return parsed[LIGHTDASH_PROFILE_NAME].outputs[LIGHTDASH_TARGET_NAME];
};

describe('a dbt source compiles against its own warehouse location', () => {
    it('writes the location into a BigQuery profile', () => {
        expect(
            targetFor({
                type: WarehouseTypes.BIGQUERY,
                project: 'primary-gcp-project',
                dataset: 'prod',
                authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
                keyfileContents: { project_id: 'primary-gcp-project' },
                timeoutSeconds: undefined,
                priority: undefined,
                retries: undefined,
                location: undefined,
                maximumBytesBilled: undefined,
            }),
        ).toMatchObject({
            project: 'source-database',
            dataset: 'source_schema',
        });
    });

    it('writes the location into a Snowflake profile', () => {
        expect(
            targetFor({
                type: WarehouseTypes.SNOWFLAKE,
                account: 'account',
                user: 'user',
                password: 'password',
                role: 'role',
                database: 'primary_database',
                warehouse: 'warehouse',
                schema: 'primary_schema',
            }),
        ).toMatchObject({
            database: 'source-database',
            schema: 'source_schema',
        });
    });

    it('writes the location into a Databricks profile, where the schema is stored as `database`', () => {
        expect(
            targetFor({
                type: WarehouseTypes.DATABRICKS,
                catalog: 'primary_catalog',
                database: 'primary_schema',
                serverHostName: 'host',
                httpPath: 'path',
                personalAccessToken: 'token',
            }),
        ).toMatchObject({
            catalog: 'source-database',
            schema: 'source_schema',
        });
    });

    it('writes the location into a Postgres profile', () => {
        expect(
            targetFor({
                type: WarehouseTypes.POSTGRES,
                host: 'host',
                user: 'user',
                password: 'password',
                port: 5432,
                dbname: 'primary_database',
                schema: 'primary_schema',
            }),
        ).toMatchObject({
            dbname: 'source-database',
            schema: 'source_schema',
        });
    });
});

describe('BigQuery key file in dbt profiles', () => {
    const bigqueryCredentials = (
        keyfileContents: Record<string, string>,
    ): CreateWarehouseCredentials => ({
        type: WarehouseTypes.BIGQUERY,
        project: 'project',
        dataset: 'dataset',
        authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
        keyfileContents,
        timeoutSeconds: undefined,
        priority: undefined,
        retries: undefined,
        location: undefined,
        maximumBytesBilled: undefined,
    });

    it('only writes known key file fields and uses the default token endpoint', () => {
        const { profile, environment } = profileFromCredentials(
            bigqueryCredentials({
                type: 'service_account',
                project_id: 'project',
                private_key: 'private-key',
                client_email: 'robot@project.iam.gserviceaccount.com',
                token_uri: 'https://example.com/token',
                auth_uri: 'https://example.com/auth',
                unexpected: 'value',
            }),
            '/tmp/profiles',
        );
        const target = (
            yaml.load(profile) as Record<
                string,
                { outputs: Record<string, Record<string, unknown>> }
            >
        )[LIGHTDASH_PROFILE_NAME].outputs[LIGHTDASH_TARGET_NAME];

        expect(Object.keys(target.keyfile_json as object).sort()).toEqual([
            'client_email',
            'private_key',
            'project_id',
            'token_uri',
            'type',
        ]);
        expect(environment).toEqual({
            LIGHTDASH_DBT_PROFILE_VAR_TYPE: 'service_account',
            LIGHTDASH_DBT_PROFILE_VAR_PROJECT_ID: 'project',
            LIGHTDASH_DBT_PROFILE_VAR_PRIVATE_KEY: 'private-key',
            LIGHTDASH_DBT_PROFILE_VAR_CLIENT_EMAIL:
                'robot@project.iam.gserviceaccount.com',
            LIGHTDASH_DBT_PROFILE_VAR_TOKEN_URI:
                'https://oauth2.googleapis.com/token',
        });
    });

    it('rejects unsupported key file types', () => {
        expect(() =>
            profileFromCredentials(
                bigqueryCredentials({
                    type: 'external_account',
                    audience: 'audience',
                }),
                '/tmp/profiles',
            ),
        ).toThrow('BigQuery key file must be a service account key');
    });
});

describe('Athena web identity profile', () => {
    it('passes no AWS credentials or role to dbt', () => {
        const target = targetFor({
            type: WarehouseTypes.ATHENA,
            region: 'eu-west-1',
            database: 'AwsDataCatalog',
            schema: 'analytics',
            s3StagingDir: 's3://bucket/results/',
            authenticationType: AthenaAuthenticationType.WEB_IDENTITY,
            assumeRoleArn: 'arn:aws:iam::123456789012:role/lightdash',
        });

        expect(target.type).toBe(WarehouseTypes.ATHENA);
        expect(target).not.toHaveProperty('aws_access_key_id');
        expect(target).not.toHaveProperty('aws_secret_access_key');
        expect(target).not.toHaveProperty('aws_assume_role_arn');
    });
});

it('rejects unresolved secret-free BigQuery SSO in dbt profiles', () => {
    expect(() =>
        profileFromCredentials(
            {
                type: WarehouseTypes.BIGQUERY,
                authenticationType: BigqueryAuthenticationType.SSO,
                project: 'analytics',
                dataset: 'prod',
                timeoutSeconds: undefined,
                priority: undefined,
                retries: undefined,
                location: undefined,
                maximumBytesBilled: undefined,
                keyfileContents: {
                    type: 'authorized_user',
                    client_id: 'id',
                    refresh_token: 'refresh',
                },
            },
            '/tmp/profiles',
        ),
    ).toThrow('resolved');
});
