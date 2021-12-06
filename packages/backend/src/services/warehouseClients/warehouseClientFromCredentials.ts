import { CreateWarehouseCredentials, WarehouseTypes } from 'common';
import { UnexpectedServerError } from '../../errors';
import Logger from '../../logger';
import { WarehouseClient } from '../../types';
import BigqueryWarehouseClient from './BigqueryWarehouseClient';
import DatabricksWarehouseClient from './DatabricksWarehouseClient';
import PostgresWarehouseClient from './PostgresWarehouseClient';
import SnowflakeWarehouseClient from './SnowflakeWarehouseClient';

export const warehouseClientFromCredentials = (
    credentials: CreateWarehouseCredentials,
): WarehouseClient => {
    Logger.debug(`Initialize warehouse client of type ${credentials.type}`);
    switch (credentials.type) {
        case WarehouseTypes.SNOWFLAKE:
            return new SnowflakeWarehouseClient(credentials);
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.REDSHIFT:
            return new PostgresWarehouseClient(credentials);
        case WarehouseTypes.BIGQUERY:
            return new BigqueryWarehouseClient(credentials);
        case WarehouseTypes.DATABRICKS:
            return new DatabricksWarehouseClient(credentials);
        default:
            const never: never = credentials;
            throw new UnexpectedServerError(
                'Warehouse credentials type were not recognised',
            );
    }
};
