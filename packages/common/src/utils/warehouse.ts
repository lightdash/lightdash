import { SupportedDbtAdapter } from '../types/dbt';
import { WarehouseTypes } from '../types/projects';
import type { WarehouseSqlBuilder } from '../types/warehouse';
import { VizAggregationOptions } from '../visualizations/types';
import assertUnreachable from './assertUnreachable';

/**
 * @deprecated use WarehouseSqlBuilder.getFieldQuoteChar instead
 * @param warehouseType
 */
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
            case WarehouseTypes.CLICKHOUSE:
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

export const getAggregatedField = (
    warehouseSqlBuilder: WarehouseSqlBuilder,
    aggregation: VizAggregationOptions,
    reference: string,
): string => {
    const q = warehouseSqlBuilder.getFieldQuoteChar();
    const adapterType = warehouseSqlBuilder.getAdapterType();
    switch (adapterType) {
        case SupportedDbtAdapter.BIGQUERY:
        case SupportedDbtAdapter.DATABRICKS:
        case SupportedDbtAdapter.SNOWFLAKE:
        case SupportedDbtAdapter.REDSHIFT:
        case SupportedDbtAdapter.TRINO:
            const aggregationFunction =
                aggregation === VizAggregationOptions.ANY
                    ? 'ANY_VALUE'
                    : aggregation;
            return `${aggregationFunction}(${q}${reference}${q})`;

        case SupportedDbtAdapter.POSTGRES:
            if (aggregation === VizAggregationOptions.ANY) {
                // ANY_VALUE on Postgres is only available from version v16+
                return `(ARRAY_AGG(${q}${reference}${q}))[1]`;
            }
            break;
        case SupportedDbtAdapter.CLICKHOUSE:
            if (aggregation === VizAggregationOptions.ANY) {
                // ClickHouse uses any() function for ANY_VALUE equivalent
                return `any(${q}${reference}${q})`;
            }
            break;
        default:
            return assertUnreachable(
                adapterType,
                `Unknown warehouse type ${adapterType}`,
            );
    }
    return `${aggregation}(${q}${reference}${q})`;
};
