import { CreateWarehouseCredentials, WarehouseTypes } from 'common';
import { QueryRunner } from '../../types';
import SnowflakeWarehouseClient from './SnowflakeWarehouseClient';
import PostgresWarehouseClient from './PostgresWarehouseClient';
import BigqueryWarehouseClient from './BigqueryWarehouseClient';

export const warehouseClientFromCredentials = (
    credentials: CreateWarehouseCredentials,
): QueryRunner | undefined => {
    switch (credentials.type) {
        case WarehouseTypes.SNOWFLAKE:
            return new SnowflakeWarehouseClient(credentials);
        case WarehouseTypes.POSTGRES:
            return new PostgresWarehouseClient(credentials);
        case WarehouseTypes.BIGQUERY:
            return new BigqueryWarehouseClient(credentials);
        default:
            return undefined;
    }
};
