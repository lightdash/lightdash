import { tableFromJSON, tableToIPC } from 'apache-arrow';
import { Database } from 'duckdb-async';
import Logger from './logging/logger';

type InMemoryJSONRow = Record<string, unknown>;
type InMemoryJSONTableMap = Record<string, InMemoryJSONRow[]>;

export interface InMemoryDatabaseProvisioningOptions {
    tables?: InMemoryJSONTableMap;
}

/**
 * Creates, and optionally provisions a new in-memory DuckDB instance.
 *
 * If table information is provided for provisioning, we use apache-arrow to load
 * said table information into DuckDB, in the format { tableName: rows[] }
 *
 * We use a thin wrapper around DuckDB that exposes its methods as promises.
 * See: https://www.npmjs.com/package/duckdb-async
 */
async function createDuckDbDatabase({
    tables,
}: InMemoryDatabaseProvisioningOptions) {
    const db = await Database.create(':memory:');
    await db.exec('INSTALL arrow; LOAD arrow;');

    if (tables) {
        await Promise.all(
            Object.entries(tables).map(([tableName, rows]) => {
                const arrowTableIPC = tableToIPC(tableFromJSON(rows));
                return db.register_buffer(tableName, [arrowTableIPC], true);
            }),
        );

        Logger.debug(
            `Loaded ${Object.keys(tables).length} arrow tables into DuckDB`,
        );
    }

    return db;
}

/**
 * Convenience method that runs a single query against a single-use
 * db instance, and returns all results.
 */
export async function runQueryInMemoryDatabaseContext({
    tables,
    query,
}: InMemoryDatabaseProvisioningOptions & {
    query: string;
}) {
    const db = await createDuckDbDatabase({ tables });
    return db.all(query);
}
