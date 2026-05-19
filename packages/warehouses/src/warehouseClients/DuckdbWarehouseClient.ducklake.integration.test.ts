/**
 * Integration tests for DuckLake mode in DuckdbWarehouseClient.
 *
 * Unlike DuckdbWarehouseClient.test.ts, this file exercises the real
 * @duckdb/node-api driver (no mocks) and the real DuckLake/SQLite extensions
 * loaded via DuckDB's known-extension autoload. It is intentionally scoped to
 * the local-only backends (SQLite catalog + local filesystem data path, plus
 * DuckDB-file catalog) because those need zero external services.
 *
 * Skip the suite when @duckdb/node-api isn't resolvable — that keeps unit-only
 * CI green even if the native binding isn't installed for the host arch.
 */
import {
    DimensionType,
    DucklakeCatalogType,
    DucklakeDataPathType,
    WarehouseTypes,
} from '@lightdash/common';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { DuckdbWarehouseClient } from './DuckdbWarehouseClient';

let driverAvailable = true;
try {
    // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
    require('@duckdb/node-api');
} catch {
    driverAvailable = false;
}

const maybeDescribe = driverAvailable ? describe : describe.skip;

const seedDucklakeWithSqliteCatalog = async ({
    catalogPath,
    dataPath,
    table,
}: {
    catalogPath: string;
    dataPath: string;
    table: string;
}): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const { DuckDBInstance } = require('@duckdb/node-api');
    const instance = await DuckDBInstance.create(':memory:');
    const conn = await instance.connect();
    try {
        await conn.run('SET autoinstall_known_extensions = true;');
        await conn.run('SET autoload_known_extensions = true;');
        await conn.run(
            `ATTACH 'ducklake:sqlite:${catalogPath}' AS ducklake (DATA_PATH '${dataPath}');`,
        );
        await conn.run('USE ducklake;');
        await conn.run(`CREATE SCHEMA IF NOT EXISTS main;`);
        await conn.run(
            `CREATE TABLE main.${table} (id INTEGER, name VARCHAR, created_at TIMESTAMP);`,
        );
        await conn.run(
            `INSERT INTO main.${table} VALUES (1, 'alice', TIMESTAMP '2026-01-01 12:00:00'), (2, 'bob', TIMESTAMP '2026-01-02 13:00:00');`,
        );
    } finally {
        conn.closeSync?.();
        conn.disconnectSync?.();
        instance.closeSync?.();
    }
};

maybeDescribe('DuckdbWarehouseClient DuckLake integration', () => {
    let workDir: string;
    let catalogPath: string;
    let dataPath: string;

    beforeEach(async () => {
        workDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'ducklake-integration-'),
        );
        catalogPath = path.join(workDir, 'catalog.sqlite');
        dataPath = path.join(workDir, 'data');
        await fs.mkdir(dataPath, { recursive: true });
        DuckdbWarehouseClient.resetSharedDuckdbStateForTesting();
    });

    afterEach(async () => {
        DuckdbWarehouseClient.resetSharedDuckdbStateForTesting();
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    });

    it('queries a seeded DuckLake (SQLite catalog + local data path)', async () => {
        await seedDucklakeWithSqliteCatalog({
            catalogPath,
            dataPath,
            table: 'users',
        });

        const client = new DuckdbWarehouseClient({
            type: WarehouseTypes.DUCKLAKE,
            schema: 'main',
            catalog: { type: DucklakeCatalogType.SQLITE, path: catalogPath },
            dataPath: { type: DucklakeDataPathType.LOCAL, path: dataPath },
        });

        const result = await client.runQuery(
            'SELECT id, name FROM main.users ORDER BY id',
        );

        expect(result.rows).toEqual([
            { id: 1, name: 'alice' },
            { id: 2, name: 'bob' },
        ]);
        expect(result.fields).toEqual(
            expect.objectContaining({
                id: { type: DimensionType.NUMBER },
                name: { type: DimensionType.STRING },
            }),
        );
    });

    it('returns the seeded table from getAllTables / getCatalog', async () => {
        await seedDucklakeWithSqliteCatalog({
            catalogPath,
            dataPath,
            table: 'orders',
        });

        const client = new DuckdbWarehouseClient({
            type: WarehouseTypes.DUCKLAKE,
            schema: 'main',
            catalog: { type: DucklakeCatalogType.SQLITE, path: catalogPath },
            dataPath: { type: DucklakeDataPathType.LOCAL, path: dataPath },
        });

        const tables = await client.getAllTables();
        expect(
            tables.find((t) => t.table === 'orders' && t.schema === 'main'),
        ).toBeDefined();

        const catalog = await client.getCatalog([
            { database: 'ducklake', schema: 'main', table: 'orders' },
        ]);
        expect(catalog.ducklake.main.orders).toEqual(
            expect.objectContaining({
                id: DimensionType.NUMBER,
                name: DimensionType.STRING,
                created_at: DimensionType.TIMESTAMP,
            }),
        );
    });

    it('reflects schema evolution between sessions', async () => {
        await seedDucklakeWithSqliteCatalog({
            catalogPath,
            dataPath,
            table: 'events',
        });

        // Add a new column via a separate raw DuckDB session.
        // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
        const { DuckDBInstance } = require('@duckdb/node-api');
        const instance = await DuckDBInstance.create(':memory:');
        const conn = await instance.connect();
        try {
            await conn.run('SET autoinstall_known_extensions = true;');
            await conn.run('SET autoload_known_extensions = true;');
            await conn.run(
                `ATTACH 'ducklake:sqlite:${catalogPath}' AS ducklake (DATA_PATH '${dataPath}');`,
            );
            await conn.run('USE ducklake;');
            await conn.run(`ALTER TABLE main.events ADD COLUMN amount DOUBLE;`);
        } finally {
            conn.closeSync?.();
            conn.disconnectSync?.();
            instance.closeSync?.();
        }

        const client = new DuckdbWarehouseClient({
            type: WarehouseTypes.DUCKLAKE,
            schema: 'main',
            catalog: { type: DucklakeCatalogType.SQLITE, path: catalogPath },
            dataPath: { type: DucklakeDataPathType.LOCAL, path: dataPath },
        });

        const catalog = await client.getCatalog([
            { database: 'ducklake', schema: 'main', table: 'events' },
        ]);
        expect(catalog.ducklake.main.events).toEqual(
            expect.objectContaining({
                amount: DimensionType.NUMBER,
            }),
        );
    });
});
