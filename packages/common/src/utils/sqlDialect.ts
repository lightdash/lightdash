import { format, type SqlLanguage } from 'sql-formatter';
import { PRE_AGGREGATE_MATERIALIZED_TABLE_PLACEHOLDER } from '../ee/preAggregates/naming';
import { WarehouseTypes } from '../types/projects';
import assertUnreachable from './assertUnreachable';

const MATERIALIZED_TABLE_SAFE_TOKEN = '__duckdb_materialized_table';

const getSqlFormatterDialect = (
    warehouseType: WarehouseTypes | undefined,
): SqlLanguage => {
    switch (warehouseType) {
        case WarehouseTypes.BIGQUERY:
            return 'bigquery';
        case WarehouseTypes.SNOWFLAKE:
            return 'snowflake';
        case WarehouseTypes.ATHENA:
        case WarehouseTypes.TRINO:
            return 'trino';
        case WarehouseTypes.DATABRICKS:
            return 'spark';
        case WarehouseTypes.CLICKHOUSE:
            return 'clickhouse';
        case WarehouseTypes.POSTGRES:
            return 'postgresql';
        case WarehouseTypes.REDSHIFT:
            return 'redshift';
        case WarehouseTypes.DUCKDB:
            return 'duckdb';
        case undefined:
            return 'sql';
        default:
            return assertUnreachable(warehouseType, 'Unknown warehouse type');
    }
};

/**
 * Formats SQL using the appropriate dialect for the given warehouse type.
 * Returns the original SQL on formatting failure.
 */
export const formatSql = (
    sql: string,
    warehouseType?: WarehouseTypes,
): string => {
    try {
        const sanitized = sql.replaceAll(
            PRE_AGGREGATE_MATERIALIZED_TABLE_PLACEHOLDER,
            MATERIALIZED_TABLE_SAFE_TOKEN,
        );
        const formatted = format(sanitized, {
            language: getSqlFormatterDialect(
                warehouseType as WarehouseTypes | undefined,
            ),
        });
        return formatted.replaceAll(
            MATERIALIZED_TABLE_SAFE_TOKEN,
            PRE_AGGREGATE_MATERIALIZED_TABLE_PLACEHOLDER,
        );
    } catch (e) {
        return sql;
    }
};
