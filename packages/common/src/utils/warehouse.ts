import { WarehouseTypes } from '../types/projects';
import { VizAggregationOptions } from '../visualizations/types';
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

export const getAggregatedField = (
    warehouseType: WarehouseTypes,
    aggregation: VizAggregationOptions,
    reference: string,
): string => {
    const q = getFieldQuoteChar(warehouseType);
    if (warehouseType) {
        switch (warehouseType) {
            case WarehouseTypes.BIGQUERY:
            case WarehouseTypes.DATABRICKS:
            case WarehouseTypes.SNOWFLAKE:
            case WarehouseTypes.REDSHIFT:
            case WarehouseTypes.TRINO:
                const aggregationFunction =
                    aggregation === VizAggregationOptions.ANY
                        ? 'ANY_VALUE'
                        : aggregation;
                return `${aggregationFunction}(${q}${reference}${q})`;

            case WarehouseTypes.POSTGRES:
                if (aggregation === VizAggregationOptions.ANY) {
                    // ANY_VALUE on Postgres is only available from version v16+
                    return `(ARRAY_AGG(${q}${reference}${q}))[1]`;
                }
                break;
            default:
                return assertUnreachable(
                    warehouseType,
                    `Unknown warehouse type ${warehouseType}`,
                );
        }
    }
    return `${aggregation}(${q}${reference}${q})`;
};
