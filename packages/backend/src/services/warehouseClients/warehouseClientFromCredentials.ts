import { CreateWarehouseCredentials, WarehouseTypes } from 'common';
import { WarehouseClient } from '../../types';
import SnowflakeWarehouseClient from './SnowflakeWarehouseClient';
import PostgresWarehouseClient from './PostgresWarehouseClient';
import BigqueryWarehouseClient from './BigqueryWarehouseClient';
import { UnexpectedServerError } from '../../errors';

export const warehouseClientFromCredentials = (
    credentials: CreateWarehouseCredentials,
): WarehouseClient => {
    switch (credentials.type) {
        case WarehouseTypes.SNOWFLAKE:
            return new SnowflakeWarehouseClient(credentials);
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
            return new PostgresWarehouseClient(credentials);
        case WarehouseTypes.BIGQUERY:
            return new BigqueryWarehouseClient(credentials);
        default:
            const never: never = credentials;
            throw new UnexpectedServerError(
                'Warehouse credentials type were not recognised',
            );
    }
};
