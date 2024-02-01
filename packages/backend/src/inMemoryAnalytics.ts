import { tableFromJSON, tableToIPC } from 'apache-arrow';
import duckdb from 'duckdb';
import { promisify as nodePromisify } from 'util';
import Logger from './logging/logger';

type InMemoryJSONRow = Record<string, unknown>;
type InMemoryJSONTableMap = Record<string, InMemoryJSONRow[]>;

export interface InMemoryDatabaseProvisioningOptions {
    tables: InMemoryJSONTableMap;
}

/**
 * Creates a new in-memory DuckDB instance, and exposes the instance itself
 * alongside some convenience wrappers.
 *
 * The following is a potential alternative that includes an async version of the client,
 * but for now we're opting for convenience + avoiding version lock from a third-party package:
 *
 * https://www.npmjs.com/package/duckdb-async
 */
function newMemoryDuckDb() {
    const db = new duckdb.Database(':memory:');

    const promisify = (method: typeof db[keyof typeof db]) =>
        nodePromisify(method).bind(db);

    return {
        db,
        exec: promisify(db.exec),
        registerBuffer: promisify(db.register_buffer),
        all: promisify(db.all),
    };
}

/**
 * Creates and prepares a DuckDB context. For now this is a straight-forward setup
 * for in-memory usage + arrow support, but it's a good place to introduce further
 * configuration options down the line if necessary.
 */
async function getInMemoryDatabaseContext({
    tables,
}: InMemoryDatabaseProvisioningOptions) {
    const dbHandle = newMemoryDuckDb();
    const { exec, registerBuffer } = dbHandle;

    await exec('INSTALL arrow; LOAD arrow;');

    await Promise.all(
        Object.entries(tables).map(([tableName, rows]) => {
            const arrowTableIPC = tableToIPC(tableFromJSON(rows));
            return registerBuffer(tableName, [arrowTableIPC], true);
        }),
    );

    Logger.debug(
        `Loaded ${Object.keys(tables).length} arrow tables into DuckDB`,
    );

    return dbHandle;
}

/**
 * Convenience method that runs a single query against a single-use
 * db instance, and returns the results.
 */
export async function runQueryInMemoryDatabaseContext(
    args: InMemoryDatabaseProvisioningOptions & {
        query: string;
    },
) {
    const { query, ...provisioningArgs } = args;
    const { all } = await getInMemoryDatabaseContext(provisioningArgs);
    const queryResult = await all(query);

    return queryResult;
}
