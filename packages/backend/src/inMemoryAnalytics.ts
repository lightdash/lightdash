import { tableFromJSON, tableToIPC } from 'apache-arrow';
import { Database } from 'duckdb-async';
import Logger from './logging/logger';
import { wrapOtelSpan } from './utils';

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
    await db.exec(`
        INSTALL arrow;
        LOAD arrow;

        SET threads TO 1;
        SET memory_limit = '512MB';
        SET enable_external_access = false;
    `);

    if (tables) {
        const loadedTableNames = await Promise.all(
            Object.entries(tables).map(async ([tableName, rows]) => {
                console.log('ROWS', rows);
                const arrowTableIPC = tableToIPC(tableFromJSON(rows));
                await db.register_buffer(tableName, [arrowTableIPC], true);

                return tableName;
            }),
        );

        Logger.debug(
            `Loaded ${loadedTableNames.length} arrow tables into DuckDB`,
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
    return wrapOtelSpan(
        'runQueryInMemoryDatabaseContext',
        {
            query,
            ...(tables ? { tables: Object.keys(tables).join(',') } : {}),
        },
        async () => {
            const db = await createDuckDbDatabase({ tables });
            const results = await db.all(query);

            return results;
        },
    );
}
