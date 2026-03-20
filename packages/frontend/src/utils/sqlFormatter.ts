import { type WarehouseTypes } from '@lightdash/common';
import { format, type FormatOptionsWithLanguage } from 'sql-formatter';

const getLanguage = (
    warehouseConnectionType?: WarehouseTypes,
): FormatOptionsWithLanguage['language'] => {
    switch (warehouseConnectionType) {
        case 'bigquery':
            return 'bigquery';
        case 'snowflake':
            return 'snowflake';
        case 'trino':
            return 'spark';
        case 'databricks':
            return 'spark';
        case 'postgres':
            return 'postgresql';
        case 'redshift':
            return 'redshift';
        default:
            return 'sql';
    }
};

/**
 * Formats SQL using the appropriate dialect for the given warehouse type.
 * Returns the original SQL on formatting failure.
 */
export const formatSql = (
    sql: string,
    warehouseConnectionType?: WarehouseTypes,
): string => {
    try {
        return format(sql, {
            language: getLanguage(warehouseConnectionType),
        });
    } catch (e) {
        console.warn(
            'Error formatting SQL:',
            e instanceof Error ? e.message : 'Unknown error occurred',
        );
        return sql;
    }
};
