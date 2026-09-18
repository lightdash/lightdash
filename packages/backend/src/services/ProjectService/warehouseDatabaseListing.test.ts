import {
    CreateWarehouseCredentials,
    DuckdbConnectionType,
    WarehouseTypes,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getDefaultListedDatabase } from './ProjectService';

describe('getDefaultListedDatabase', () => {
    it.each([
        {
            type: WarehouseTypes.BIGQUERY,
            credentials: { project: 'billing-project' },
            expected: {
                name: 'billing-project',
                database: 'billing-project',
                schema: null,
                isDefault: true,
            },
        },
        {
            type: WarehouseTypes.POSTGRES,
            credentials: { dbname: 'analytics' },
            expected: {
                name: 'analytics',
                database: 'analytics',
                schema: null,
                isDefault: true,
            },
        },
        {
            type: WarehouseTypes.REDSHIFT,
            credentials: { dbname: 'warehouse' },
            expected: {
                name: 'warehouse',
                database: 'warehouse',
                schema: null,
                isDefault: true,
            },
        },
        {
            type: WarehouseTypes.SNOWFLAKE,
            credentials: { database: 'ANALYTICS' },
            expected: {
                name: 'analytics',
                database: 'analytics',
                schema: null,
                isDefault: true,
            },
        },
        {
            type: WarehouseTypes.DATABRICKS,
            credentials: { catalog: 'main' },
            expected: {
                name: 'main',
                database: 'main',
                schema: null,
                isDefault: true,
            },
        },
        {
            type: WarehouseTypes.TRINO,
            credentials: { dbname: 'hive' },
            expected: {
                name: 'hive',
                database: 'hive',
                schema: null,
                isDefault: true,
            },
        },
        {
            type: WarehouseTypes.DUCKDB,
            credentials: {
                connectionType: DuckdbConnectionType.MOTHERDUCK,
                database: 'pond',
            },
            expected: {
                name: 'pond',
                database: 'pond',
                schema: null,
                isDefault: true,
            },
        },
        {
            type: WarehouseTypes.ATHENA,
            credentials: { database: 'AwsDataCatalog', schema: 'default' },
            expected: {
                name: 'default',
                database: 'AwsDataCatalog',
                schema: 'default',
                isDefault: true,
            },
        },
        {
            type: WarehouseTypes.CLICKHOUSE,
            credentials: { schema: 'default' },
            expected: {
                name: 'default',
                database: '',
                schema: 'default',
                isDefault: true,
            },
        },
    ])(
        'builds the default entry for $type',
        ({ type, credentials, expected }) => {
            expect(
                getDefaultListedDatabase({
                    type,
                    ...credentials,
                } as unknown as CreateWarehouseCredentials),
            ).toEqual(expected);
        },
    );
});
