import {
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    CreateWarehouseCredentials,
    WarehouseTypes,
} from '@lightdash/common';
import * as yaml from 'js-yaml';
import { minimalProfileFromCredentials } from './profiles';

const DUMMY_SECRET = 'LIGHTDASH_DUMMY';

type DbtProfileYaml = {
    lightdash_profile: {
        target: string;
        outputs: Record<string, Record<string, unknown>>;
    };
};

const assertNoSecrets = (
    target: Record<string, unknown>,
    secrets: string[],
) => {
    const targetStr = JSON.stringify(target);
    for (const secret of secrets) {
        expect(targetStr).not.toContain(secret);
    }
};

const assertValidProfileYaml = (profileStr: string) => {
    const parsed = yaml.load(profileStr) as DbtProfileYaml;
    expect(parsed).toHaveProperty('lightdash_profile');
    expect(parsed.lightdash_profile).toHaveProperty('target');
    expect(parsed.lightdash_profile).toHaveProperty('outputs');
};

describe('minimalProfileFromCredentials', () => {
    describe('BigQuery', () => {
        it('produces minimal profile with dummy keyfile values for private key auth', () => {
            const credentials: CreateWarehouseCredentials = {
                type: WarehouseTypes.BIGQUERY,
                project: 'my-project',
                dataset: 'my_dataset',
                timeoutSeconds: 300,
                priority: 'interactive',
                retries: 3,
                maximumBytesBilled: 1000000,
                executionProject: 'exec-project',
                location: 'US',
                authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
                keyfileContents: {
                    type: 'service_account',
                    project_id: 'my-project',
                    private_key_id: 'key-id-123',
                    private_key:
                        '-----BEGIN RSA PRIVATE KEY-----\nSECRET\n-----END RSA PRIVATE KEY-----',
                    client_email: 'sa@project.iam.gserviceaccount.com',
                },
            };

            const { profile, environment } =
                minimalProfileFromCredentials(credentials);
            assertValidProfileYaml(profile);
            expect(environment).toEqual({});

            const parsed = yaml.load(profile) as DbtProfileYaml;
            const target = parsed.lightdash_profile.outputs.prod;

            expect(target.project).toBe('my-project');
            expect(target.dataset).toBe('my_dataset');
            expect(target.method).toBe('service-account-json');
            expect(target.keyfile_json).toBeDefined();
            // All keyfile values should be dummy
            for (const value of Object.values(
                target.keyfile_json as Record<string, string>,
            )) {
                expect(value).toBe(DUMMY_SECRET);
            }
            // Key structure preserved
            expect(
                Object.keys(target.keyfile_json as Record<string, unknown>),
            ).toEqual([
                'type',
                'project_id',
                'private_key_id',
                'private_key',
                'client_email',
            ]);
            assertNoSecrets(target, ['-----BEGIN RSA', 'key-id-123']);
        });

        it('produces minimal profile for ADC auth', () => {
            const credentials: CreateWarehouseCredentials = {
                type: WarehouseTypes.BIGQUERY,
                project: 'my-project',
                dataset: 'my_dataset',
                timeoutSeconds: 300,
                priority: 'interactive',
                retries: 3,
                maximumBytesBilled: 0,
                location: 'US',
                authenticationType: BigqueryAuthenticationType.ADC,
                keyfileContents: {},
            };

            const { profile } = minimalProfileFromCredentials(credentials);
            assertValidProfileYaml(profile);

            const parsed = yaml.load(profile) as DbtProfileYaml;
            const target = parsed.lightdash_profile.outputs.prod;
            expect(target.method).toBe('oauth');
        });
    });

    describe('Postgres', () => {
        it('keeps user but dummies password', () => {
            const credentials: CreateWarehouseCredentials = {
                type: WarehouseTypes.POSTGRES,
                host: 'localhost',
                user: 'admin',
                password: 'super_secret_password',
                port: 5432,
                dbname: 'mydb',
                schema: 'public',
                keepalivesIdle: 0,
                searchPath: '',
                role: undefined,
                sslmode: undefined,
            };

            const { profile, environment } =
                minimalProfileFromCredentials(credentials);
            assertValidProfileYaml(profile);
            expect(environment).toEqual({});

            const parsed = yaml.load(profile) as DbtProfileYaml;
            const target = parsed.lightdash_profile.outputs.prod;

            expect(target.user).toBe('admin');
            expect(target.password).toBe(DUMMY_SECRET);
            expect(target.host).toBe('localhost');
            assertNoSecrets(target, ['super_secret_password']);
        });
    });

    describe('Redshift', () => {
        it('keeps user but dummies password', () => {
            const credentials: CreateWarehouseCredentials = {
                type: WarehouseTypes.REDSHIFT,
                host: 'cluster.redshift.amazonaws.com',
                user: 'redshift_user',
                password: 'redshift_secret',
                port: 5439,
                dbname: 'warehouse',
                schema: 'analytics',
                keepalivesIdle: 0,
                sslmode: 'require',
                ra3Node: true,
            };

            const { profile } = minimalProfileFromCredentials(credentials);
            assertValidProfileYaml(profile);

            const parsed = yaml.load(profile) as DbtProfileYaml;
            const target = parsed.lightdash_profile.outputs.prod;

            expect(target.user).toBe('redshift_user');
            expect(target.password).toBe(DUMMY_SECRET);
            assertNoSecrets(target, ['redshift_secret']);
        });
    });

    describe('Snowflake', () => {
        it('dummies password for all auth types', () => {
            const credentials: CreateWarehouseCredentials = {
                type: WarehouseTypes.SNOWFLAKE,
                account: 'myaccount',
                user: 'snowflake_user',
                password: 'snowflake_secret',
                role: 'analyst',
                database: 'ANALYTICS',
                warehouse: 'COMPUTE_WH',
                schema: 'PUBLIC',
                clientSessionKeepAlive: true,
                queryTag: 'lightdash',
            };

            const { profile } = minimalProfileFromCredentials(credentials);
            assertValidProfileYaml(profile);

            const parsed = yaml.load(profile) as DbtProfileYaml;
            const target = parsed.lightdash_profile.outputs.prod;

            expect(target.user).toBe('snowflake_user');
            expect(target.password).toBe(DUMMY_SECRET);
            expect(target.account).toBe('myaccount');
            expect(target.role).toBe('analyst');
            assertNoSecrets(target, ['snowflake_secret']);
        });
    });

    describe('Databricks', () => {
        it('dummies token', () => {
            const credentials: CreateWarehouseCredentials = {
                type: WarehouseTypes.DATABRICKS,
                catalog: 'main',
                database: 'analytics',
                serverHostName: 'adb-123.azuredatabricks.net',
                httpPath: '/sql/1.0/warehouses/abc',
                personalAccessToken: 'dapi_secret_token_123',
            };

            const { profile } = minimalProfileFromCredentials(credentials);
            assertValidProfileYaml(profile);

            const parsed = yaml.load(profile) as DbtProfileYaml;
            const target = parsed.lightdash_profile.outputs.prod;

            expect(target.token).toBe(DUMMY_SECRET);
            expect(target.host).toBe('adb-123.azuredatabricks.net');
            assertNoSecrets(target, ['dapi_secret_token_123']);
        });
    });

    describe('Trino', () => {
        it('keeps user but dummies password', () => {
            const credentials: CreateWarehouseCredentials = {
                type: WarehouseTypes.TRINO,
                host: 'trino.example.com',
                user: 'trino_user',
                password: 'trino_secret',
                port: 8443,
                dbname: 'hive',
                schema: 'default',
                http_scheme: 'https',
            };

            const { profile } = minimalProfileFromCredentials(credentials);
            assertValidProfileYaml(profile);

            const parsed = yaml.load(profile) as DbtProfileYaml;
            const target = parsed.lightdash_profile.outputs.prod;

            expect(target.user).toBe('trino_user');
            expect(target.password).toBe(DUMMY_SECRET);
            assertNoSecrets(target, ['trino_secret']);
        });
    });

    describe('ClickHouse', () => {
        it('keeps user but dummies password', () => {
            const credentials: CreateWarehouseCredentials = {
                type: WarehouseTypes.CLICKHOUSE,
                host: 'clickhouse.example.com',
                user: 'ch_user',
                password: 'ch_secret',
                port: 8443,
                schema: 'default',
                secure: true,
            };

            const { profile } = minimalProfileFromCredentials(credentials);
            assertValidProfileYaml(profile);

            const parsed = yaml.load(profile) as DbtProfileYaml;
            const target = parsed.lightdash_profile.outputs.prod;

            expect(target.user).toBe('ch_user');
            expect(target.password).toBe(DUMMY_SECRET);
            assertNoSecrets(target, ['ch_secret']);
        });
    });

    describe('Athena', () => {
        it('dummies access keys for access key auth', () => {
            const credentials: CreateWarehouseCredentials = {
                type: WarehouseTypes.ATHENA,
                region: 'us-east-1',
                database: 'mydb',
                schema: 'default',
                s3StagingDir: 's3://bucket/staging',
                authenticationType: AthenaAuthenticationType.ACCESS_KEY,
                accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
            };

            const { profile } = minimalProfileFromCredentials(credentials);
            assertValidProfileYaml(profile);

            const parsed = yaml.load(profile) as DbtProfileYaml;
            const target = parsed.lightdash_profile.outputs.prod;

            expect(target.aws_access_key_id).toBe(DUMMY_SECRET);
            expect(target.aws_secret_access_key).toBe(DUMMY_SECRET);
            expect(target.region_name).toBe('us-east-1');
            assertNoSecrets(target, ['AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI']);
        });

        it('omits access keys for IAM auth', () => {
            const credentials: CreateWarehouseCredentials = {
                type: WarehouseTypes.ATHENA,
                region: 'us-east-1',
                database: 'mydb',
                schema: 'default',
                s3StagingDir: 's3://bucket/staging',
                authenticationType: AthenaAuthenticationType.IAM_ROLE,
                accessKeyId: undefined,
                secretAccessKey: undefined,
            };

            const { profile } = minimalProfileFromCredentials(credentials);
            assertValidProfileYaml(profile);

            const parsed = yaml.load(profile) as DbtProfileYaml;
            const target = parsed.lightdash_profile.outputs.prod;

            expect(target.aws_access_key_id).toBeUndefined();
            expect(target.aws_secret_access_key).toBeUndefined();
        });
    });

    describe('custom target name', () => {
        it('uses custom target name when provided', () => {
            const credentials: CreateWarehouseCredentials = {
                type: WarehouseTypes.POSTGRES,
                host: 'localhost',
                user: 'admin',
                password: 'pass',
                port: 5432,
                dbname: 'mydb',
                schema: 'public',
                keepalivesIdle: 0,
                searchPath: '',
                role: undefined,
                sslmode: undefined,
            };

            const { profile } = minimalProfileFromCredentials(
                credentials,
                'custom_target',
            );
            const parsed = yaml.load(profile) as DbtProfileYaml;

            expect(parsed.lightdash_profile.target).toBe('custom_target');
            expect(
                parsed.lightdash_profile.outputs.custom_target,
            ).toBeDefined();
        });
    });
});
