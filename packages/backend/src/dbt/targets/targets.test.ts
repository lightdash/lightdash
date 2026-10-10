import {
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    DuckdbConnectionType,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import * as yaml from 'js-yaml';
import { profileFromCredentials } from '../profiles';
import { bigqueryAdc, targetCases } from './targets.mock';

describe('legacy dbt target characterisation', () => {
    it.each(targetCases)(
        '$name preserves the complete profile and environment',
        ({ credentials, target, environment }) => {
            const actual = profileFromCredentials(credentials, '/tmp/profiles');
            expect(yaml.load(actual.profile)).toEqual({
                lightdash_profile: {
                    target: 'prod',
                    outputs: { prod: target },
                },
            });
            expect(actual.environment).toEqual(environment);
            expect(actual.files).toBeUndefined();
        },
    );

    it('preserves a custom target name and exact YAML bytes', () => {
        expect(
            profileFromCredentials(
                {
                    ...bigqueryAdc,
                    timeoutSeconds: undefined,
                    priority: undefined,
                    retries: undefined,
                    maximumBytesBilled: undefined,
                    executionProject: undefined,
                },
                '/tmp/profiles',
                'compile',
            ),
        ).toEqual({
            profile:
                'lightdash_profile:\n  target: compile\n  outputs:\n    compile:\n      type: bigquery\n      project: billing-project\n      dataset: analytics\n      threads: 1\n      method: oauth\n',
            environment: {},
            files: undefined,
        });
    });
});

interface ErrorCase {
    name: string;
    credentials: CreateWarehouseCredentials;
    message: string;
}
const redshift = {
    type: WarehouseTypes.REDSHIFT as const,
    host: 'host',
    port: 5439,
    dbname: 'warehouse',
    schema: 'analytics',
    user: 'user',
    authenticationType: RedshiftAuthenticationType.IAM,
};
const snowflake = {
    type: WarehouseTypes.SNOWFLAKE as const,
    account: 'account',
    user: 'user',
    database: 'warehouse',
    warehouse: 'compute',
    schema: 'analytics',
};
const errorCases: ErrorCase[] = [
    {
        name: 'BigQuery missing keyfile',
        credentials: {
            ...bigqueryAdc,
            authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
            keyfileContents: undefined,
        } as unknown as CreateWarehouseCredentials,
        message:
            'BigQuery private key/SSO authentication requires keyfileContents to be provided',
    },
    {
        name: 'BigQuery unresolved SSO',
        credentials: {
            ...bigqueryAdc,
            authenticationType: BigqueryAuthenticationType.SSO,
            keyfileContents: {
                type: 'authorized_user',
                client_id: 'id',
                refresh_token: 'refresh',
            },
        },
        message:
            'BigQuery SSO credentials must be resolved before creating a dbt profile',
    },
    {
        name: 'BigQuery unsupported key type',
        credentials: {
            ...bigqueryAdc,
            authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
            keyfileContents: { type: 'external_account' },
        },
        message:
            'BigQuery key file must be a service account key. Other credential types, such as workload identity federation configurations, are not supported via key file upload.',
    },
    {
        name: 'Redshift IAM missing region',
        credentials: redshift,
        message: 'Redshift IAM authentication requires an AWS region',
    },
    {
        name: 'Redshift IAM unresolved assume role',
        credentials: {
            ...redshift,
            region: 'eu-west-1',
            assumeRoleArn: 'arn:aws:iam::123456789012:role/query',
        },
        message:
            'Redshift IAM assume-role is not yet supported for dbt compilation. Use static AWS credentials, the host IAM role, or remove the assume-role ARN.',
    },
    ...[
        undefined,
        SnowflakeAuthenticationType.PASSWORD,
        SnowflakeAuthenticationType.PRIVATE_KEY,
        SnowflakeAuthenticationType.EXTERNAL_BROWSER,
        SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE,
        SnowflakeAuthenticationType.NONE,
    ].map(
        (authenticationType): ErrorCase => ({
            name: `Snowflake ${authenticationType ?? 'undefined'} missing secret`,
            credentials: { ...snowflake, authenticationType },
            message:
                'Incorrect snowflake profile. Profile should have SSO credentials, password or private key.',
        }),
    ),
    {
        name: 'Databricks missing token',
        credentials: {
            type: WarehouseTypes.DATABRICKS,
            catalog: 'catalog',
            database: 'schema',
            serverHostName: 'host',
            httpPath: '/sql',
        },
        message:
            'Databricks credentials must have either token or personalAccessToken',
    },
    ...[AthenaAuthenticationType.ACCESS_KEY, undefined].map(
        (authenticationType): ErrorCase => ({
            name: `Athena ${authenticationType ?? 'undefined'} missing keys`,
            credentials: {
                type: WarehouseTypes.ATHENA,
                authenticationType,
                region: 'eu-west-1',
                database: 'catalog',
                schema: 'schema',
                s3StagingDir: 's3://staging/',
            },
            message:
                'Athena access key authentication requires accessKeyId and secretAccessKey',
        }),
    ),
    {
        name: 'embedded DuckDB',
        credentials: {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.EMBEDDED,
            dataset: 'jaffle',
        },
        message:
            'Embedded DuckDB credentials cannot be used for dbt compilation',
    },
    {
        name: 'analytics DuckDB',
        credentials: {
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.ANALYTICS,
            database: 'memory',
            schema: 'main',
        },
        message:
            'Embedded DuckDB credentials cannot be used for dbt compilation',
    },
];

describe('legacy dbt target errors', () => {
    it.each(errorCases)(
        '$name preserves the exact error',
        ({ credentials, message }) => {
            expect.assertions(2);
            try {
                profileFromCredentials(credentials, '/tmp/profiles');
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toBe(message);
            }
        },
    );
});
