import {
    assertUnreachable,
    WarehouseTypes,
    type WarehouseTablesCatalog,
} from '@lightdash/common';

export type CatalogTable = { database: string; schema: string; table: string };

// Names that can be written into SQL as they are.
const PLAIN_NAME = /^[\w-]+$/;

/** The names a model's table is written with, last part first; null for a query or a name that needs parsing. */
export const parseTableReference = (sqlTable: string): string[] | null => {
    const parts = sqlTable
        .trim()
        .split('.')
        .map((part) => part.replace(/^[`"[]|[`"\]]$/g, ''));
    return parts.length <= 3 && parts.every((part) => PLAIN_NAME.test(part))
        ? parts.reverse()
        : null;
};

/** The one table in the warehouse catalog a reference names, however it is cased or qualified; null when none or several match. */
export const findCatalogTable = (
    catalog: WarehouseTablesCatalog,
    [table, schema, database]: string[],
): CatalogTable | null => {
    const isSame = (name: string, wanted: string | undefined) =>
        wanted === undefined || name.toLowerCase() === wanted.toLowerCase();
    const matches = Object.entries(catalog).flatMap(
        ([catalogDatabase, schemas]) =>
            Object.entries(schemas).flatMap(([catalogSchema, tables]) =>
                Object.keys(tables)
                    .filter(
                        (name) =>
                            isSame(name, table) &&
                            isSame(catalogSchema, schema) &&
                            isSame(catalogDatabase, database),
                    )
                    .map((name) => ({
                        database: catalogDatabase,
                        schema: catalogSchema,
                        table: name,
                    })),
            ),
    );
    return matches.length === 1 ? matches[0] : null;
};

/** SQL that reads a table's approximate row count from the warehouse's own metadata, scanning nothing; null where there is no cheap way to ask. */
export const getRowCountSql = (
    warehouseType: WarehouseTypes,
    { database, schema, table }: CatalogTable,
    quoteString: (value: string) => string,
): string | null => {
    switch (warehouseType) {
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
            return `SELECT c.reltuples AS row_count FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = ${quoteString(schema)} AND c.relname = ${quoteString(table)}`;
        case WarehouseTypes.SNOWFLAKE:
            return PLAIN_NAME.test(database)
                ? `SELECT row_count FROM "${database}".information_schema.tables WHERE table_schema = ${quoteString(schema)} AND table_name = ${quoteString(table)}`
                : null;
        case WarehouseTypes.BIGQUERY:
            return PLAIN_NAME.test(database) && PLAIN_NAME.test(schema)
                ? `SELECT row_count FROM \`${database}.${schema}.__TABLES__\` WHERE table_id = ${quoteString(table)}`
                : null;
        case WarehouseTypes.CLICKHOUSE:
            return `SELECT total_rows AS row_count FROM system.tables WHERE database IN (${quoteString(schema)}, ${quoteString(database)}) AND name = ${quoteString(table)}`;
        case WarehouseTypes.DUCKDB:
            return `SELECT estimated_size AS row_count FROM duckdb_tables() WHERE schema_name = ${quoteString(schema)} AND table_name = ${quoteString(table)}`;
        // ponytail: no metadata row count that is cheap and dependable; these fall back to the capped read.
        case WarehouseTypes.DATABRICKS:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.ATHENA:
            return null;
        default:
            return assertUnreachable(warehouseType, 'Unknown warehouse type');
    }
};
