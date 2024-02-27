import { DimensionType } from '@lightdash/common';
import * as arrow from 'apache-arrow';
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
 * Converts DimensionType into an arrow data type. Arrow will gladly figure
 * this out by itself, but it's prone to do it innacurately (e.g discarding
 * time information on tiemestamps).
 */
function dimensionTypeToArrowDataType(
    dimensionType: DimensionType,
): arrow.DataType {
    switch (dimensionType) {
        case DimensionType.BOOLEAN:
            return new arrow.Bool();
        case DimensionType.DATE:
            return new arrow.DateMillisecond();
        case DimensionType.TIMESTAMP:
            return new arrow.Timestamp(arrow.TimeUnit.MILLISECOND);
        case DimensionType.NUMBER:
            return new arrow.Float64();
        case DimensionType.STRING:
            return new arrow.Utf8();
        default:
            throw new Error(
                `Unsupported dimension type to arrow datatype conversion: ${dimensionType}`,
            );
    }
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
                    const columnVectors = await wrapOtelSpan(
                        'inMemoryTableCalculations.buildColumnVectors',
                        {
                            totalColumnValues:
                                Object.keys(fields).length * rows.length,
                        },
                        async () =>
                            /**
                             * For each row, collect all values in all rows, and map the row type
                             * into an arrow vector:
                             */
                            Object.entries(fields).reduce<
                                Record<string, arrow.Vector>
                            >((acc, [fieldName, field]) => {
                                // Get all values in the result set for this field name::
                                acc[fieldName] = arrow.vectorFromArray(
                                    rows.map((row) => row[fieldName]),
                                    dimensionTypeToArrowDataType(field.type),
                                );

                                return acc;
                            }, {}),
                    );

                    const arrowTableIPC = arrow.tableToIPC(
                        new arrow.Table(columnVectors),
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
