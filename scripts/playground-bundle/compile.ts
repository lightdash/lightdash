/**
 * Shared DuckDB access for the playground scripts: opening the bundled
 * database and reading the warehouse catalog the dbt adapter needs before it
 * can compile explores. Used by build.ts (which builds the bundle) and by
 * learnLessons.test.ts (which compiles the learn bundle with a lesson
 * snippet applied).
 */
import { DimensionType } from '@lightdash/common';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type DuckDbConnection = {
    closeSync(): void;
    run(
        sql: string,
    ): Promise<{ getRowObjects(): Promise<Record<string, unknown>[]> }>;
};

export type WarehouseCatalog = Record<
    string,
    Record<string, Record<string, Record<string, DimensionType>>>
>;

const loadDuckDb = async () => {
    const requireFromWarehouses = createRequire(
        path.resolve(__dirname, '../../packages/warehouses/package.json'),
    );
    const modulePath = requireFromWarehouses.resolve('@duckdb/node-api');
    return import(pathToFileURL(modulePath).href) as Promise<{
        DuckDBInstance: {
            create(
                database: string,
                options?: Record<string, string>,
            ): Promise<{
                connect(): Promise<DuckDbConnection>;
                closeSync(): void;
            }>;
        };
    }>;
};

export const withDatabase = async <T>(
    databasePath: string,
    callback: (connection: DuckDbConnection) => Promise<T>,
): Promise<T> => {
    const { DuckDBInstance } = await loadDuckDb();
    const instance = await DuckDBInstance.create(databasePath, {
        default_block_size: '16384',
    });
    const connection = await instance.connect();
    try {
        return await callback(connection);
    } finally {
        connection.closeSync();
        instance.closeSync();
    }
};

const typeFromDuckDb = (type: string): DimensionType => {
    if (/BOOL/i.test(type)) return DimensionType.BOOLEAN;
    if (/TIMESTAMP|TIME/i.test(type)) return DimensionType.TIMESTAMP;
    if (/DATE/i.test(type)) return DimensionType.DATE;
    if (/INT|DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL/i.test(type)) {
        return DimensionType.NUMBER;
    }
    return DimensionType.STRING;
};

export const getCatalog = (databasePath: string): Promise<WarehouseCatalog> =>
    withDatabase(databasePath, async (connection) => {
        const result = await connection.run(`
            SELECT table_catalog, table_schema, table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'jaffle'
            ORDER BY table_name, ordinal_position
        `);
        const rows = await result.getRowObjects();
        const catalog: WarehouseCatalog = {};
        for (const row of rows) {
            const database = String(row.table_catalog);
            const schema = String(row.table_schema);
            const table = String(row.table_name);
            catalog[database] ??= {};
            catalog[database][schema] ??= {};
            catalog[database][schema][table] ??= {};
            catalog[database][schema][table][String(row.column_name)] =
                typeFromDuckDb(String(row.data_type));
        }
        return catalog;
    });
