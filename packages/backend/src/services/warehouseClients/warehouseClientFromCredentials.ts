import { CreateWarehouseCredentials, WarehouseTypes } from 'common';
import PostgresWarehouseClient from './PostgresWarehouseClient';
import { QueryRunner } from '../../types';
import SnowflakeWarehouseClient from './SnowflakeWarehouseClient';

export const warehouseClientFromCredentials = (
    credentials: CreateWarehouseCredentials,
): QueryRunner | undefined => {
    switch (credentials.type) {
        case WarehouseTypes.SNOWFLAKE:
            return new SnowflakeWarehouseClient(credentials);
        case WarehouseTypes.POSTGRES:
            return new PostgresWarehouseClient(credentials);
        default:
            return undefined;
    }
};
