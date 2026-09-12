import {
    DuckdbConnectionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    ParseError,
    WarehouseTypes,
} from '@lightdash/common';
import {
    mkdirSync,
    mkdtempSync,
    realpathSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

    describe('local file paths', () => {
        let dataDir: string;
        let outsideDir: string;
        const previousEnv = process.env.PLAYGROUND_DATA_DIR;

        beforeEach(() => {
            dataDir = realpathSync(
                mkdtempSync(path.join(tmpdir(), 'ld-playground-')),
            );
            outsideDir = realpathSync(
                mkdtempSync(path.join(tmpdir(), 'ld-outside-')),
            );
            writeFileSync(path.join(dataDir, 'jaffle_shop.duckdb'), '');
            writeFileSync(path.join(outsideDir, 'secret.duckdb'), '');
            mkdirSync(path.join(dataDir, 'nested'));
            writeFileSync(path.join(dataDir, 'nested', 'deep.duckdb'), '');
            writeFileSync(path.join(dataDir, 'My-Shop.duckdb'), '');
            mkdirSync(path.join(dataDir, 'dir.duckdb'));
            symlinkSync(
                path.join(outsideDir, 'secret.duckdb'),
                path.join(dataDir, 'escape.duckdb'),
            );
            process.env.PLAYGROUND_DATA_DIR = dataDir;
        });

        afterEach(() => {
            if (previousEnv === undefined)
                delete process.env.PLAYGROUND_DATA_DIR;
            else process.env.PLAYGROUND_DATA_DIR = previousEnv;
            rmSync(dataDir, { recursive: true, force: true });
            rmSync(outsideDir, { recursive: true, force: true });
        });

        test('resolves a file inside PLAYGROUND_DATA_DIR to embedded credentials', () => {
            expect(
                convertDuckdbSchema({
                    type: 'duckdb',
                    path: path.join(dataDir, 'jaffle_shop.duckdb'),
                    schema: 'jaffle',
                }),
            ).toEqual({
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.EMBEDDED,
                dataset: 'jaffle_shop',
                schema: 'jaffle',
            });
        });

        test('rejects a file outside PLAYGROUND_DATA_DIR', () => {
            expect(() =>
                convertDuckdbSchema({
                    type: 'duckdb',
                    path: path.join(outsideDir, 'secret.duckdb'),
                    schema: 'jaffle',
                }),
            ).toThrow(ParseError);
        });

        test('rejects a symlink that escapes PLAYGROUND_DATA_DIR', () => {
            expect(() =>
                convertDuckdbSchema({
                    type: 'duckdb',
                    path: path.join(dataDir, 'escape.duckdb'),
                    schema: 'jaffle',
                }),
            ).toThrow(ParseError);
        });

        test('rejects a file in a subdirectory of PLAYGROUND_DATA_DIR', () => {
            expect(() =>
                convertDuckdbSchema({
                    type: 'duckdb',
                    path: path.join(dataDir, 'nested', 'deep.duckdb'),
                    schema: 'jaffle',
                }),
            ).toThrow(ParseError);
        });

        test('rejects a missing file', () => {
            expect(() =>
                convertDuckdbSchema({
                    type: 'duckdb',
                    path: path.join(dataDir, 'missing.duckdb'),
                    schema: 'jaffle',
                }),
            ).toThrow(ParseError);
        });

        test('rejects a dataset name outside the embedded pattern', () => {
            expect(() =>
                convertDuckdbSchema({
                    type: 'duckdb',
                    path: path.join(dataDir, 'My-Shop.duckdb'),
                    schema: 'jaffle',
                }),
            ).toThrow(ParseError);
        });

        test('rejects a directory named like a database', () => {
            expect(() =>
                convertDuckdbSchema({
                    type: 'duckdb',
                    path: path.join(dataDir, 'dir.duckdb'),
                    schema: 'jaffle',
                }),
            ).toThrow(ParseError);
        });

        test('rejects every local path when PLAYGROUND_DATA_DIR is unset', () => {
            delete process.env.PLAYGROUND_DATA_DIR;
            expect(() =>
                convertDuckdbSchema({
                    type: 'duckdb',
                    path: path.join(dataDir, 'jaffle_shop.duckdb'),
                    schema: 'jaffle',
                }),
            ).toThrow(ParseError);
        });
    });
});
