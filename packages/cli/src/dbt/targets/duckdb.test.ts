import {
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import { convertDuckdbSchema } from './duckdb';

describe('convertDuckdbSchema', () => {
    test('should parse MotherDuck duckdb targets', () => {
        expect(
            convertDuckdbSchema({
                type: 'duckdb',
                path: 'md:analytics',
                schema: 'main',
                threads: 4,
                settings: {
                    motherduck_token: 'motherduck_token',
                },
            }),
        ).toEqual({
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.MOTHERDUCK,
            database: 'analytics',
            schema: 'main',
            token: 'motherduck_token',
            threads: 4,
        });
    });

    test('should parse MotherDuck duckdb targets with token in path query string', () => {
        expect(
            convertDuckdbSchema({
                type: 'duckdb',
                path: 'md:analytics?motherduck_token=motherduck_token',
                schema: 'main',
                threads: 4,
            }),
        ).toEqual({
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.MOTHERDUCK,
            database: 'analytics',
            schema: 'main',
            token: 'motherduck_token',
            threads: 4,
        });
    });

    test('should reject duckdb targets that are neither MotherDuck nor DuckLake', () => {
        expect(() =>
            convertDuckdbSchema({
                type: 'duckdb',
                path: 'analytics.duckdb',
                schema: 'main',
            }),
        ).toThrow(ParseError);
    });

    test('should require a MotherDuck token', () => {
        expect(() =>
            convertDuckdbSchema({
                type: 'duckdb',
                path: 'md:analytics',
                schema: 'main',
            }),
        ).toThrow(ParseError);
    });

    test('should parse a DuckLake target with postgres catalog and S3 data path', () => {
        expect(
            convertDuckdbSchema({
                type: 'duckdb',
                path: ':memory:',
                schema: 'main',
                threads: 4,
                attach: [
                    {
                        path: 'ducklake:ld_ducklake',
                        alias: 'ducklake',
                    },
                ],
                secrets: [
                    {
                        name: 'ld_ducklake_catalog',
                        type: 'postgres',
                        host: 'pg.example.com',
                        port: 5432,
                        database: 'catalog',
                        user: 'ducklake_user',
                        password: 'p@ss',
                    },
                    {
                        name: 'ld_ducklake_data',
                        type: 's3',
                        scope: 's3://my-bucket/path/',
                        region: 'us-east-1',
                        key_id: 'AKIAEXAMPLE',
                        secret: 'SECRETEXAMPLE',
                        url_style: 'vhost',
                        use_ssl: true,
                    },
                    {
                        name: 'ld_ducklake',
                        type: 'ducklake',
                        data_path: 's3://my-bucket/path/',
                        metadata_parameters: {
                            TYPE: 'postgres',
                            SECRET: 'ld_ducklake_catalog',
                        },
                    },
                ],
            }),
        ).toEqual({
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.DUCKLAKE,
            schema: 'main',
            catalogAlias: 'ducklake',
            threads: 4,
            catalog: {
                type: DucklakeCatalogType.POSTGRES,
                host: 'pg.example.com',
                port: 5432,
                database: 'catalog',
                user: 'ducklake_user',
                password: 'p@ss',
            },
            dataPath: {
                type: DucklakeDataPathType.S3,
                url: 's3://my-bucket/path/',
                endpoint: undefined,
                region: 'us-east-1',
                accessKeyId: 'AKIAEXAMPLE',
                secretAccessKey: 'SECRETEXAMPLE',
                forcePathStyle: false,
                useSsl: true,
            },
        });
    });

    test('should parse a DuckLake target with SQLite catalog and local data path', () => {
        expect(
            convertDuckdbSchema({
                type: 'duckdb',
                path: ':memory:',
                schema: 'main',
                attach: [
                    {
                        path: 'ducklake:sqlite:/tmp/ducklake.sqlite',
                        alias: 'ducklake',
                        options: { data_path: '/tmp/ducklake-data' },
                    },
                ],
            }),
        ).toEqual({
            type: WarehouseTypes.DUCKDB,
            connectionType: DuckdbConnectionType.DUCKLAKE,
            schema: 'main',
            catalogAlias: 'ducklake',
            threads: undefined,
            catalog: {
                type: DucklakeCatalogType.SQLITE,
                path: '/tmp/ducklake.sqlite',
            },
            dataPath: {
                type: DucklakeDataPathType.LOCAL,
                path: '/tmp/ducklake-data',
            },
        });
    });
});
