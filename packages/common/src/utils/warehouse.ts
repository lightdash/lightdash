import { SupportedDbtAdapter } from '../types/dbt';
import { DimensionType, type CompiledField } from '../types/field';
import { WarehouseTypes } from '../types/projects';
import { TimeFrames } from '../types/timeFrames';
import { type TimeZone } from '../types/timezone';
import assertUnreachable from './assertUnreachable';

export const getFieldQuoteChar = (
    warehouseType: WarehouseTypes | undefined,
) => {
    if (warehouseType) {
        switch (warehouseType) {
            case WarehouseTypes.BIGQUERY:
            case WarehouseTypes.DATABRICKS:
                return '`';
            case WarehouseTypes.SNOWFLAKE:
            case WarehouseTypes.REDSHIFT:
            case WarehouseTypes.POSTGRES:
            case WarehouseTypes.TRINO:
                return '"';
            default:
                return assertUnreachable(
                    warehouseType,
                    `Unknown warehouse type ${warehouseType}`,
                );
        }
    }
    return '"';
};

export const convertBigqueryTimezone = (
    field: CompiledField,
    adapterType: SupportedDbtAdapter,
    originalFieldSql: string,
    timezone?: TimeZone,
) => {
    // On Bigquery we convert timestamps to the right timezone before adding the SQL filter
    // Bigquery does not support set TIMEZONE in session like the rest of the warehouses
    // and field.compiledSql is generated in compile time, so we need to patch it here
    // Only timestamp type in Bigquery has timezone information.
    if (timezone && adapterType === SupportedDbtAdapter.BIGQUERY) {
        if (
            field.type === DimensionType.TIMESTAMP &&
            field.timeInterval === TimeFrames.RAW
        ) {
            return `TIMESTAMP_TRUNC(${originalFieldSql}, SECOND, '${timezone}')`;
        }
        // We can alternatively pass a `timezone` to the TIMESTAMP_TRUNC function
        const timestampRegex = /TIMESTAMP_TRUNC\(([^,]+),/;
        return originalFieldSql.replace(
            timestampRegex,
            `TIMESTAMP_TRUNC(DATE($1, '${timezone}'),`,
        );
    }
    return originalFieldSql;
};
