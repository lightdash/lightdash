import {
    BigqueryAuthenticationType,
    DuckdbConnectionType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '../types/projects';
import {
    applyWarehouseLocation,
    EMPTY_WAREHOUSE_LOCATION,
    getWarehouseLocation,
    normalizeWarehouseLocation,
    validateWarehouseLocation,
} from './warehouseLocation';

const bigqueryCredentials: CreateWarehouseCredentials = {
    type: WarehouseTypes.BIGQUERY,
    project: 'primary-gcp-project',
    dataset: 'prod',
    authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
    keyfileContents: {},
    timeoutSeconds: undefined,
    priority: undefined,
    retries: undefined,
    location: undefined,
    maximumBytesBilled: undefined,
};

const snowflakeCredentials: CreateWarehouseCredentials = {
    type: WarehouseTypes.SNOWFLAKE,
    account: 'account',
    user: 'user',
    password: 'password',
    role: 'role',
    database: 'primary_database',
    warehouse: 'warehouse',
    schema: 'primary_schema',
};

const databricksCredentials: CreateWarehouseCredentials = {
    type: WarehouseTypes.DATABRICKS,
    catalog: 'primary_catalog',
    database: 'primary_schema',
    serverHostName: 'host',
    httpPath: 'path',
    personalAccessToken: 'token',
};

const clickhouseCredentials: CreateWarehouseCredentials = {
    type: WarehouseTypes.CLICKHOUSE,
    host: 'host',
    user: 'user',
    password: 'password',
    port: 8443,
    schema: 'primary_schema',
};

const motherduckCredentials: CreateWarehouseCredentials = {
    type: WarehouseTypes.DUCKDB,
    connectionType: DuckdbConnectionType.MOTHERDUCK,
    database: 'primary_database',
    schema: 'primary_schema',
    token: 'token',
};

describe('applyWarehouseLocation', () => {
    it('returns the credentials untouched when the location is empty', () => {
        expect(
            applyWarehouseLocation(
                bigqueryCredentials,
                EMPTY_WAREHOUSE_LOCATION,
            ),
        ).toBe(bigqueryCredentials);
    });

    it('overrides the BigQuery project and dataset', () => {
        expect(
            applyWarehouseLocation(bigqueryCredentials, {
                database: 'source-gcp-project',
                schema: 'source_dataset',
            }),
        ).toMatchObject({
            project: 'source-gcp-project',
            dataset: 'source_dataset',
        });
    });

    it('keeps the fields the location leaves null', () => {
        expect(
            applyWarehouseLocation(bigqueryCredentials, {
                database: null,
                schema: 'source_dataset',
            }),
        ).toMatchObject({
            project: 'primary-gcp-project',
            dataset: 'source_dataset',
        });
    });

    it('leaves the rest of the connection alone', () => {
        expect(
            applyWarehouseLocation(snowflakeCredentials, {
                database: 'source_database',
                schema: 'source_schema',
            }),
        ).toEqual({
            ...snowflakeCredentials,
            database: 'source_database',
            schema: 'source_schema',
        });
    });

    it('maps a Databricks location onto its catalog and schema', () => {
        expect(
            applyWarehouseLocation(databricksCredentials, {
                database: 'source_catalog',
                schema: 'source_schema',
            }),
        ).toMatchObject({
            catalog: 'source_catalog',
            database: 'source_schema',
        });
    });

    it('overrides the MotherDuck database and schema', () => {
        expect(
            applyWarehouseLocation(motherduckCredentials, {
                database: 'source_database',
                schema: 'source_schema',
            }),
        ).toMatchObject({
            database: 'source_database',
            schema: 'source_schema',
        });
    });

    it('rejects a database on a warehouse that has none', () => {
        expect(() =>
            applyWarehouseLocation(clickhouseCredentials, {
                database: 'source_database',
                schema: null,
            }),
        ).toThrowError(/not qualified by a database/);
    });

    it('still overrides the schema on a warehouse without a database', () => {
        expect(
            applyWarehouseLocation(clickhouseCredentials, {
                database: null,
                schema: 'source_schema',
            }),
        ).toMatchObject({ schema: 'source_schema' });
    });
});

describe('getWarehouseLocation', () => {
    it('reads the location a connection already points at', () => {
        expect(getWarehouseLocation(bigqueryCredentials)).toEqual({
            database: 'primary-gcp-project',
            schema: 'prod',
        });
        expect(getWarehouseLocation(databricksCredentials)).toEqual({
            database: 'primary_catalog',
            schema: 'primary_schema',
        });
        expect(getWarehouseLocation(clickhouseCredentials)).toEqual({
            database: null,
            schema: 'primary_schema',
        });
    });
});

describe('validateWarehouseLocation', () => {
    it('accepts a database the warehouse has', () => {
        expect(() =>
            validateWarehouseLocation(bigqueryCredentials, {
                database: 'source-gcp-project',
                schema: null,
            }),
        ).not.toThrow();
    });

    it('rejects a database the warehouse does not have', () => {
        expect(() =>
            validateWarehouseLocation(clickhouseCredentials, {
                database: 'source_database',
                schema: null,
            }),
        ).toThrowError(/not qualified by a database/);
    });

    it('rejects any location on embedded DuckDB, which cannot compile dbt at all', () => {
        expect(() =>
            validateWarehouseLocation(
                {
                    type: WarehouseTypes.DUCKDB,
                    connectionType: DuckdbConnectionType.EMBEDDED,
                    dataset: 'primary_dataset',
                },
                { database: null, schema: 'source_schema' },
            ),
        ).toThrowError(/Embedded DuckDB/);
    });

    it('accepts a location on MotherDuck, which can', () => {
        expect(() =>
            validateWarehouseLocation(motherduckCredentials, {
                database: null,
                schema: 'source_schema',
            }),
        ).not.toThrow();
    });
});

describe('normalizeWarehouseLocation', () => {
    it('reads a blank field as inherit, so it never becomes an override', () => {
        expect(
            normalizeWarehouseLocation({ database: '', schema: '   ' }),
        ).toEqual(EMPTY_WAREHOUSE_LOCATION);
    });

    it('trims a field the caller padded', () => {
        expect(
            normalizeWarehouseLocation({
                database: ' source-gcp-project ',
                schema: null,
            }),
        ).toEqual({ database: 'source-gcp-project', schema: null });
    });
});
