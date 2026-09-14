import {
    applyWarehouseLocation,
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
} from './profiles';

const sourceLocation: WarehouseLocation = {
    database: 'source-database',
    schema: 'source_schema',
};

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
