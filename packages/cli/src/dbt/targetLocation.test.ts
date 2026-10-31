import { WarehouseTypes } from '@lightdash/common';
import { DbtLocationError, getDbtTargetLocation } from './targetLocation';
import type { Target } from './types';

it.each<[Target, { type: WarehouseTypes; database: string; region?: string }]>([
    [
        { type: 'postgres', dbname: 'pg_db', schema: 'public' },
        { type: WarehouseTypes.POSTGRES, database: 'pg_db' },
    ],
    [
        { type: 'postgres', database: 'pg_alias' },
        { type: WarehouseTypes.POSTGRES, database: 'pg_alias' },
    ],
    [
        { type: 'postgres', dbname: 'primary', database: 'alias' },
        { type: WarehouseTypes.POSTGRES, database: 'primary' },
    ],
    [
        { type: 'postgres', dbname: '', database: 'alias' },
        { type: WarehouseTypes.POSTGRES, database: 'alias' },
    ],
    [
        { type: 'redshift', dbname: 'rs_db' },
        { type: WarehouseTypes.REDSHIFT, database: 'rs_db' },
    ],
    [
        { type: 'redshift', database: 'rs_alias' },
        { type: WarehouseTypes.REDSHIFT, database: 'rs_alias' },
    ],
    [
        {
            type: 'redshift',
            dbname: 'primary',
            database: 'alias',
            method: 'iam',
        },
        { type: WarehouseTypes.REDSHIFT, database: 'primary' },
    ],
    [
        { type: 'snowflake', database: 'snow_db' },
        { type: WarehouseTypes.SNOWFLAKE, database: 'snow_db' },
    ],
    [
        {
            type: 'bigquery',
            project: 'gcp-project',
            dataset: 'dataset_a',
            execution_project: 'billing-project',
        },
        { type: WarehouseTypes.BIGQUERY, database: 'gcp-project' },
    ],
    [
        { type: 'bigquery', project: 'gcp-project', schema: 'dataset_alias' },
        { type: WarehouseTypes.BIGQUERY, database: 'gcp-project' },
    ],
    [
        { type: 'databricks', catalog: 'catalog_a', schema: 'schema_a' },
        { type: WarehouseTypes.DATABRICKS, database: 'catalog_a' },
    ],
    [
        { type: 'databricks', schema: 'schema_a' },
        { type: WarehouseTypes.DATABRICKS, database: 'schema_a' },
    ],
    [
        { type: 'databricks', catalog: null, schema: 'schema_a' },
        { type: WarehouseTypes.DATABRICKS, database: 'schema_a' },
    ],
    [
        { type: 'trino', database: 'catalog_a', schema: 'schema_a' },
        { type: WarehouseTypes.TRINO, database: 'catalog_a' },
    ],
    [
        { type: 'clickhouse', database: 'unused', schema: 'schema_a' },
        { type: WarehouseTypes.CLICKHOUSE, database: 'schema_a' },
    ],
    [
        {
            type: 'athena',
            database: 'AwsDataCatalog',
            schema: 'schema_a',
            region_name: 'eu-west-1',
            region: 'unused',
        },
        {
            type: WarehouseTypes.ATHENA,
            database: 'AwsDataCatalog',
            region: 'eu-west-1',
        },
    ],
    [
        {
            type: 'duckdb',
            path: 'md:analytics?motherduck_token=private-token&other=private-value',
            schema: 'main',
            database: 'unused',
        },
        { type: WarehouseTypes.DUCKDB, database: 'analytics' },
    ],
    [
        { type: 'duckdb', path: 'md:analytics', schema: 'main' },
        { type: WarehouseTypes.DUCKDB, database: 'analytics' },
    ],
    [
        {
            type: 'duckdb',
            path: 'md:unused',
            schema: 'main',
            attach: [{ path: 'ducklake:private/catalog.db', alias: 'lake' }],
            secrets: [{ password: 'private-password' }],
        },
        { type: WarehouseTypes.DUCKDB, database: 'lake' },
    ],
    [
        {
            type: 'duckdb',
            schema: 'lake_schema',
            attach: [{ path: 'ducklake:private/catalog.db' }],
        },
        { type: WarehouseTypes.DUCKDB, database: 'lake_schema' },
    ],
    [
        {
            type: 'duckdb',
            schema: 'lake_schema',
            attach: [
                { path: 'other.db', alias: 'other' },
                { path: 'ducklake:sqlite:private/catalog.db', alias: 'lake' },
            ],
        },
        { type: WarehouseTypes.DUCKDB, database: 'lake' },
    ],
    [
        {
            type: 'duckdb',
            path: '/private/datasets/example.duckdb',
            schema: 'embedded_schema',
            database: 'unused',
        },
        { type: WarehouseTypes.DUCKDB, database: 'embedded_schema' },
    ],
    [
        { type: 'duckdb', path: 'example.duckdb', schema: 'main' },
        { type: WarehouseTypes.DUCKDB, database: 'main' },
    ],
])('extracts only the location from %j', (target, expected) => {
    expect(getDbtTargetLocation(target)).toEqual(expected);
});

it.each<Target>([
    { type: 'spark' },
    { type: 'unsupported', database: 'db' },
    { type: 'postgres', schema: 'not_a_database' },
    { type: 'redshift', schema: 'not_a_database' },
    { type: 'snowflake', schema: 'not_a_database' },
    {
        type: 'bigquery',
        method: 'oauth',
        dataset: 'not_a_project',
        execution_project: 'not_a_project',
    },
    { type: 'bigquery', database: 'not_a_project' },
    { type: 'trino', dbname: 'not_the_database_field' },
    { type: 'databricks', catalog: '', schema: 'not_a_catalog' },
    { type: 'databricks' },
    { type: 'clickhouse', database: 'not_the_schema' },
    { type: 'athena', database: 'catalog', region: 'not_region_name' },
    { type: 'athena', database: 'catalog', region_name: 123 },
    { type: 'athena', database: 'catalog', region_name: 'x'.repeat(256) },
    {
        type: 'duckdb',
        path: 'md:?motherduck_token=private-token',
        schema: 'not_a_database',
    },
    { type: 'duckdb', path: '/private/data.csv', schema: 'main' },
    { type: 'duckdb', path: ':memory:', schema: 'main' },
    { type: 'duckdb', schema: 'main' },
    {
        type: 'duckdb',
        path: '/private/example.duckdb?token=private-token',
        schema: 'main',
    },
    { type: 'duckdb', attach: 'private-attach', schema: 'main' },
    { type: 'duckdb', attach: [null], schema: 'main' },
    {
        type: 'duckdb',
        attach: [{ path: 'ducklake:private-path', alias: 5 }],
        schema: 'main',
    },
    {
        type: 'duckdb',
        attach: [{ path: 'ducklake:private-path', alias: '' }],
        schema: 'main',
    },
    { type: 'postgres', dbname: 123, database: 'not_a_valid_fallback' },
    { type: 'postgres', dbname: false, database: 'not_a_valid_fallback' },
    { type: 'redshift', dbname: 0, database: 'not_a_valid_fallback' },
    ...[
        undefined,
        null,
        '',
        ' ',
        123,
        {},
        [],
        'x'.repeat(256),
        'db\nprivate-token',
    ].map((database) => ({ type: 'snowflake', database })),
])('rejects unavailable or unsafe location fields in %j', (target) => {
    expect(() => getDbtTargetLocation(target)).toThrow(DbtLocationError);
    try {
        getDbtTargetLocation(target);
    } catch (error) {
        expect(String(error)).not.toMatch(/private-|private\/|private\\/);
    }
});

it('accepts a location at the metadata length limit', () => {
    expect(
        getDbtTargetLocation({ type: 'snowflake', database: 'x'.repeat(255) }),
    ).toEqual({ type: WarehouseTypes.SNOWFLAKE, database: 'x'.repeat(255) });
});

it.each(['project_a:dataset', 'project_a/project_b', 'project_a?version=1'])(
    'keeps opaque warehouse location names %s',
    (database) => {
        expect(getDbtTargetLocation({ type: 'snowflake', database })).toEqual({
            type: WarehouseTypes.SNOWFLAKE,
            database,
        });
    },
);
