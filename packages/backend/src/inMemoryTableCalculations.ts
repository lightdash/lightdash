import { DimensionType, parseDate, parseTimestamp } from '@lightdash/common';
import { tableFromJSON, tableToIPC } from 'apache-arrow';
import { Database } from 'duckdb-async';
import Logger from './logging/logger';
import { wrapOtelSpan } from './utils';

type InMemoryJSONRow = Record<string, unknown>;
type InMemoryJSONTableMap = Record<
    string,
    {
        fields: Record<string, { type: DimensionType }>;
        rows: InMemoryJSONRow[];
    }
>;

export interface InMemoryDatabaseProvisioningOptions {
    tables?: InMemoryJSONTableMap;
}

/**
 * Use field information to cast individual row values, so that they are
 * represented with the correct type in-memory.
 *
 * The js SDK for arrow seems to be pretty limited as far handling this
 * via a schema or other type inference override, but that would likely
 * be the best approach, if possible.
 */
export const castValueToType = (value: unknown, fieldType: DimensionType) => {
    if (value === null) {
        return null;
    }

    switch (fieldType) {
        case DimensionType.BOOLEAN:
            if (value === 'true') {
                return true;
            }

            if (value === 'false') {
                return false;
            }

            throw new Error('DimensionType.BOOLEAN value cannot be cast');
        case DimensionType.NUMBER:
            /**
             * Casting the number value this way allows us to bypass assumptions about the
             * underlying number type:
             */
            return (value as unknown as number) * 1;
        case DimensionType.DATE:
        case DimensionType.TIMESTAMP:
        case DimensionType.STRING:
            return value;
        default:
            throw new Error(`Unable to cast value to type ${fieldType}`);
    }
};

/**
 * Creates, and optionally provisions a new in-memory DuckDB instance.
 *
 * If table information is provided for provisioning, we use apache-arrow to load
 * said table information into DuckDB, in the format { tableName: rows[] }
 *
 * We use a thin wrapper around DuckDB that exposes its methods as promises.
 * See: https://www.npmjs.com/package/duckdb-async
 */
export const createDuckDbDatabase = async ({
    tables,
}: InMemoryDatabaseProvisioningOptions) => {
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
            Object.entries(tables).map(
                async ([tableName, { rows, fields }]) => {
                    const rowsWithFieldCasts = rows.map((row) =>
                        Object.fromEntries(
                            Object.entries(row).map(([columnName, value]) => {
                                const fieldType = fields[columnName].type;
                                return [
                                    columnName,
                                    castValueToType(value, fieldType),
                                ];
                            }),
                        ),
                    );

                    const arrowTableIPC = tableToIPC(
                        tableFromJSON(rowsWithFieldCasts),
                    );
                    await db.register_buffer(tableName, [arrowTableIPC], true);
                    return tableName;
                },
            ),
        );

        Logger.debug(
            `Loaded ${loadedTableNames.length} arrow tables into DuckDB`,
        );
    }

    return db;
};

/**
 * Convenience method that runs a single query against a single-use
 * db instance, and returns all results.
 */
export const runQueryInMemoryDatabaseContext = async ({
    tables,
    query,
}: InMemoryDatabaseProvisioningOptions & {
    query: string;
}) =>
    wrapOtelSpan(
        'runQueryInMemoryDatabaseContext',
        {
            query,
            ...(tables ? { tables: Object.keys(tables).join(',') } : {}),
        },
        async () => {
            const db = await createDuckDbDatabase({ tables });
            return db.all(query);
        },
    );
