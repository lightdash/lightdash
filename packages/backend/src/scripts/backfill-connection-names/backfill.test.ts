import {
    deriveConnectionName,
    DuckdbConnectionType,
    WarehouseTypes,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { vi } from 'vitest';
import {
    runConnectionNameBackfill,
    type ConnectionNameBackfillDatabase,
    type ConnectionNameBackfillRow,
} from './backfill';

const credentials = (value: object): CreateWarehouseCredentials =>
    value as CreateWarehouseCredentials;

describe('deriveConnectionName', () => {
    test.each([
        [
            'Athena',
            credentials({
                type: WarehouseTypes.ATHENA,
                database: 'AwsDataCatalog',
                region: 'eu-west-1',
            }),
            'AwsDataCatalog eu-west-1',
        ],
        [
            'BigQuery',
            credentials({
                type: WarehouseTypes.BIGQUERY,
                project: 'analytics-project',
            }),
            'analytics-project',
        ],
        [
            'Snowflake',
            credentials({
                type: WarehouseTypes.SNOWFLAKE,
                database: 'ANALYTICS',
            }),
            'ANALYTICS',
        ],
        [
            'Databricks',
            credentials({
                type: WarehouseTypes.DATABRICKS,
                catalog: 'main',
            }),
            'main',
        ],
        [
            'Trino',
            credentials({ type: WarehouseTypes.TRINO, dbname: 'hive' }),
            'hive',
        ],
        [
            'Postgres',
            credentials({ type: WarehouseTypes.POSTGRES, dbname: 'reporting' }),
            'reporting',
        ],
        [
            'Redshift',
            credentials({ type: WarehouseTypes.REDSHIFT, dbname: 'warehouse' }),
            'warehouse',
        ],
        [
            'ClickHouse',
            credentials({ type: WarehouseTypes.CLICKHOUSE, schema: 'default' }),
            'default',
        ],
        [
            'DuckDB MotherDuck',
            credentials({
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.MOTHERDUCK,
                database: 'my_db',
            }),
            'my_db',
        ],
        [
            'DuckDB embedded',
            credentials({
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.EMBEDDED,
                dataset: 'events',
            }),
            'events',
        ],
        [
            'DuckDB DuckLake',
            credentials({
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.DUCKLAKE,
                catalogAlias: 'lake',
            }),
            'lake',
        ],
        [
            'DuckDB analytics',
            credentials({
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.ANALYTICS,
                database: 'memory',
            }),
            'memory',
        ],
    ])('derives the %s connection name', (_label, input, expected) => {
        expect(deriveConnectionName(input)).toEqual(expected);
    });
});

const row = (
    warehouseCredentialsId: number,
    overrides: Partial<ConnectionNameBackfillRow> = {},
): ConnectionNameBackfillRow => ({
    warehouseCredentialsId,
    projectId: 10,
    warehouseType: 'postgres',
    name: 'Postgres',
    organizationWarehouseCredentialsUuid: null,
    encryptedCredentials: Buffer.from('reporting'),
    organizationWarehouseConnection: null,
    ...overrides,
});

const decrypt = (ciphertext: Buffer) =>
    JSON.stringify({
        type: WarehouseTypes.POSTGRES,
        dbname: ciphertext.toString(),
    });

describe('runConnectionNameBackfill', () => {
    test('resumes after fromId and advances the cursor by batch', async () => {
        const database: ConnectionNameBackfillDatabase = {
            fetchRows: vi
                .fn()
                .mockResolvedValueOnce([row(43)])
                .mockResolvedValueOnce([]),
            getLiveNames: vi.fn().mockResolvedValue(['Postgres']),
            renameIfDefault: vi.fn().mockResolvedValue('renamed'),
        };

        const report = await runConnectionNameBackfill(
            database,
            { decrypt },
            { dryRun: false, fromId: 42 },
            vi.fn(),
        );

        expect(database.fetchRows).toHaveBeenNthCalledWith(1, 42, 200);
        expect(database.fetchRows).toHaveBeenNthCalledWith(2, 43, 200);
        expect(report).toMatchObject({ processed: 1, renamed: 1 });
    });

    test('reserves collision suffixes without writing in dry-run mode', async () => {
        const database: ConnectionNameBackfillDatabase = {
            fetchRows: vi
                .fn()
                .mockResolvedValueOnce([row(1)])
                .mockResolvedValueOnce([]),
            getLiveNames: vi
                .fn()
                .mockResolvedValue(['Postgres', 'reporting', 'reporting 2']),
            renameIfDefault: vi.fn(),
        };
        const log = vi.fn();

        const report = await runConnectionNameBackfill(
            database,
            { decrypt },
            { dryRun: true, fromId: 0 },
            log,
        );

        expect(database.renameIfDefault).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(
            'Would rename connection 1: Postgres -> reporting 3',
        );
        expect(report).toMatchObject({
            mode: 'dry-run',
            processed: 1,
            renamed: 1,
        });
    });

    test('retries with the next suffix after a concurrent collision', async () => {
        const database: ConnectionNameBackfillDatabase = {
            fetchRows: vi
                .fn()
                .mockResolvedValueOnce([row(1)])
                .mockResolvedValueOnce([]),
            getLiveNames: vi.fn().mockResolvedValue(['Postgres']),
            renameIfDefault: vi
                .fn()
                .mockResolvedValueOnce('collision')
                .mockResolvedValueOnce('renamed'),
        };

        await runConnectionNameBackfill(
            database,
            { decrypt },
            { dryRun: false, fromId: 0 },
            vi.fn(),
        );

        expect(database.renameIfDefault).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            'reporting',
        );
        expect(database.renameIfDefault).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            'reporting 2',
        );
    });

    test('skips a decrypt failure and continues with the batch', async () => {
        const database: ConnectionNameBackfillDatabase = {
            fetchRows: vi
                .fn()
                .mockResolvedValueOnce([
                    row(1, { encryptedCredentials: Buffer.from('bad') }),
                    row(2),
                ])
                .mockResolvedValueOnce([]),
            getLiveNames: vi.fn().mockResolvedValue(['Postgres']),
            renameIfDefault: vi.fn().mockResolvedValue('renamed'),
        };
        const decryptWithFailure = (ciphertext: Buffer) => {
            if (ciphertext.toString() === 'bad') {
                throw new Error('cannot decrypt');
            }
            return decrypt(ciphertext);
        };

        const report = await runConnectionNameBackfill(
            database,
            { decrypt: decryptWithFailure },
            { dryRun: false, fromId: 0 },
            vi.fn(),
        );

        expect(report).toMatchObject({
            processed: 2,
            renamed: 1,
            skipped: { 'decrypt-failed': 1 },
        });
    });
});
