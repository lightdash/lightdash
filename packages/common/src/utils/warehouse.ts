import { WarehouseTypes } from '../types/projects';
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
